import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    buildDedupKey,
    CALL_REPORT_ENTITY_TYPE_DEAL,
    CallAnalysisBitrixService,
    TranscriptionRouterService,
    TranscriptionStoreService,
    AiService,
} from '@lib/call-lib';
import { LlmOrchestratorService, LlmModel, LLM_MODELS } from '@lib/ai-rag';

/** Задача конвейера: один звонок (сделка) на обработку. */
export interface CallReportJobPayload {
    domain: string;
    activityId: number;
    dealId: number;
    callId?: string;
    callStartedAtIso?: string;
    durationSec?: number;
}

export interface CallReportPipelineResult {
    transcriptionId: string;
    provider: string;
    resumeSaved: boolean;
    recomendationSaved: boolean;
}

const APP_NAME = 'call-report';

/**
 * Конвейер обработки одного звонка: аудио из Bitrix → транскрибация
 * (Yandex/Vibecode по длительности) → первичный RAG-анализ GigaChat
 * (resume + recomendation) → персист в transcriptions/ais → короткое
 * резюме в таймлайн сделки.
 *
 * Смарт-элемент здесь НЕ создаётся — его создаёт push-back внешнего
 * агента (agent-gate) поверх этих данных.
 *
 * Идемпотентность: upsert по dedup_key; при ошибке строка получает
 * status='error' и звонок снова виден дедупу следующего скана.
 */
@Injectable()
export class CallReportPipelineUseCase {
    private readonly logger = new Logger(CallReportPipelineUseCase.name);
    private readonly llmModel: LlmModel;

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionRouter: TranscriptionRouterService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly llmOrchestrator: LlmOrchestratorService,
        private readonly configService: ConfigService,
    ) {
        const model = this.configService.get<string>('CALL_REPORT_LLM_MODEL');
        this.llmModel = LLM_MODELS.includes(model as LlmModel)
            ? (model as LlmModel)
            : 'gigachat';
    }

    async execute(
        payload: CallReportJobPayload,
    ): Promise<CallReportPipelineResult> {
        const dedupKey = buildDedupKey(payload.domain, payload.activityId);
        const row = await this.transcriptionStore.startPipeline({
            dedupKey,
            domain: payload.domain,
            activityId: String(payload.activityId),
            callId: payload.callId,
            callStartedAt: payload.callStartedAtIso
                ? new Date(payload.callStartedAtIso)
                : undefined,
            entityType: CALL_REPORT_ENTITY_TYPE_DEAL,
            entityId: String(payload.dealId),
            durationSec: payload.durationSec,
            app: APP_NAME,
        });

        try {
            const result = await this.process(payload, row.id);
            return result;
        } catch (error) {
            await this.transcriptionStore
                .finishPipeline(row.id, { status: 'error' })
                .catch(() => undefined);
            throw error;
        }
    }

    private async process(
        payload: CallReportJobPayload,
        transcriptionId: string,
    ): Promise<CallReportPipelineResult> {
        const { bitrix } = await this.pbxService.init(payload.domain);
        const bx = new CallAnalysisBitrixService(bitrix);

        const activity = await bx.getActivityById(payload.activityId);
        if (!activity) {
            throw new NotFoundException(
                `Activity ${payload.activityId} not found (${payload.domain})`,
            );
        }
        const audioFiles = await bx.getAudioFiles([activity]);
        if (!audioFiles.length) {
            throw new NotFoundException(
                `No audio files in activity ${payload.activityId}`,
            );
        }
        const audioFile = audioFiles[0];
        const buffer = await bx.downloadAudioBuffer(audioFile.downloadUrl);

        const { text, provider } = await this.transcriptionRouter.transcribe({
            buffer,
            fileName: audioFile.fileName,
            domain: payload.domain,
            durationSec: payload.durationSec,
        });

        await this.transcriptionStore.finishPipeline(transcriptionId, {
            status: 'done',
            provider,
            text,
            symbolsCount: String(text.length),
            durationSec: payload.durationSec,
        });

        const resume = await this.runAnalysis('resume', text, payload);
        const recomendation = await this.runAnalysis(
            'recomendation',
            text,
            payload,
        );

        const resumeSaved = await this.saveAiRecord(
            'call-resume',
            resume,
            payload,
            transcriptionId,
        );
        const recomendationSaved = await this.saveAiRecord(
            'call-recomendation',
            recomendation,
            payload,
            transcriptionId,
        );

        if (resume) {
            await this.addResumeToTimeline(bx, payload, resume).catch(error =>
                this.logger.warn(
                    `Таймлайн не записан (${payload.domain}, deal ${payload.dealId}): ${(error as Error).message}`,
                ),
            );
        }

        return {
            transcriptionId,
            provider,
            resumeSaved,
            recomendationSaved,
        };
    }

    /** Один вид анализа; ошибка не роняет конвейер (транскрипт уже сохранён). */
    private async runAnalysis(
        kind: 'resume' | 'recomendation',
        text: string,
        payload: CallReportJobPayload,
    ): Promise<string | null> {
        try {
            return kind === 'resume'
                ? await this.llmOrchestrator.resume(
                      this.llmModel,
                      text,
                      payload.domain,
                  )
                : await this.llmOrchestrator.recomendation(
                      this.llmModel,
                      text,
                      payload.domain,
                  );
        } catch (error) {
            this.logger.warn(
                `GigaChat ${kind} не выполнен (activity ${payload.activityId}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    private async saveAiRecord(
        type: 'call-resume' | 'call-recomendation',
        result: string | null,
        payload: CallReportJobPayload,
        transcriptionId: string,
    ): Promise<boolean> {
        if (!result) return false;
        try {
            await this.aiService.create({
                provider: this.llmModel,
                model: this.llmModel,
                type,
                status: 'done',
                result,
                user_result: { text: result } as Prisma.JsonValue,
                activity_id: String(payload.activityId),
                entity_type: CALL_REPORT_ENTITY_TYPE_DEAL,
                entity_id: payload.dealId,
                domain: payload.domain,
                app: APP_NAME,
                transcription_id: transcriptionId,
            });
            return true;
        } catch (error) {
            this.logger.warn(
                `AI-запись ${type} не сохранена: ${(error as Error).message}`,
            );
            return false;
        }
    }

    private async addResumeToTimeline(
        bx: CallAnalysisBitrixService,
        payload: CallReportJobPayload,
        resume: string,
    ): Promise<void> {
        const responsibleId = await bx.getDealResponsibleId(payload.dealId);
        const { bitrix } = await this.pbxService.init(payload.domain);
        const comment =
            `📞 [b]AI-резюме звонка[/b] (активность #${payload.activityId})\n\n` +
            `${resume.slice(0, 3000)}${resume.length > 3000 ? '...' : ''}`;
        await bitrix.timeline.addTimelineComment({
            ENTITY_ID: payload.dealId,
            ENTITY_TYPE: CALL_REPORT_ENTITY_TYPE_DEAL,
            COMMENT: comment,
            AUTHOR_ID: String(responsibleId),
        });
    }
}
