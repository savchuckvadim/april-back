import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { envEnabledByDefault } from '@lib/shared';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    buildDedupKey,
    CALL_RECOMENDATION_TYPE,
    CALL_REPORT_ENTITY_TYPE_DEAL,
    CALL_REPORT_ENTITY_TYPE_LEAD,
    CALL_RESUME_TYPE,
    CallAnalysisBitrixService,
    CallReportEntityType,
    TranscriptionRouterService,
    TranscriptionStoreService,
    AiService,
} from '@lib/call-lib';
import { LlmOrchestratorService, LlmModel, LLM_MODELS } from '@lib/ai-rag';
import { CallClassifyStepService } from '../services/call-classify-step.service';

/** Задача конвейера: один звонок (по сделке или лиду) на обработку. */
export interface CallReportJobPayload {
    domain: string;
    activityId: number;
    /**
     * Id сущности-владельца звонка. Историческое имя: для entityType='lead'
     * здесь лежит id ЛИДА (менять имя нельзя — payload живёт в Redis-джобах).
     */
    dealId: number;
    /** Тип владельца; отсутствует в старых джобах → 'deal'. */
    entityType?: CallReportEntityType;
    callId?: string;
    callStartedAtIso?: string;
    durationSec?: number;
    /**
     * После стадии ANALYZE создать базовый элемент смарта «AI-анализ
     * звонков». Ставит флаг сканер (cron/ручка), исполняет процессор —
     * сам конвейер смарт по-прежнему не трогает. Отсутствует в старых
     * джобах → false.
     */
    createSmartItem?: boolean;
}

/**
 * Задача стадии анализа: та же адресация звонка + id строки транскрипции,
 * созданной стадией транскрибации (текст НЕ кладём в Redis-payload —
 * стадия анализа перечитывает его из БД).
 */
export interface CallReportAnalyzeStagePayload extends CallReportJobPayload {
    transcriptionId: string;
}

/** Результат стадии транскрибации. */
export interface CallReportTranscribeResult {
    transcriptionId: string;
    provider: string;
}

export interface CallReportPipelineResult {
    transcriptionId: string;
    provider: string;
    resumeSaved: boolean;
    recomendationSaved: boolean;
    /** Тип звонка от дешёвого классификатора (null — классификация не удалась/выключена). */
    callType: string | null;
}

const APP_NAME = 'call-report';

/**
 * Конвейер обработки одного звонка, ДВЕ стадии:
 *
 * 1. executeTranscribe — аудио из Bitrix → транскрибация (Yandex/Vibecode
 *    по длительности) → персист текста + менеджера;
 * 2. executeAnalyze — дешёвая классификация типа (VibeCode, ключ портала)
 *    → первичный RAG-анализ (resume + recomendation ОДНИМ объединённым
 *    вызовом LLM) → ais-записи → резюме в таймлайн сделки.
 *
 * В очереди стадии идут отдельными джобами (CALL_REPORT_TRANSCRIBE →
 * CALL_REPORT_ANALYZE): транскрибация звонка N+1 не ждёт анализа звонка N.
 * execute() гоняет обе стадии подряд — синхронный путь /analyze.
 *
 * Смарт-элемент здесь НЕ создаётся — его создаёт push-back внешнего
 * агента (agent-gate) поверх этих данных.
 *
 * Идемпотентность: upsert по dedup_key; при ошибке транскрибации строка
 * получает status='error' и звонок снова виден дедупу следующего скана.
 * Ошибки анализа НЕ ломают строку (транскрипт уже сохранён) — LLM-шаги
 * мягкие, ретрай стадии анализа делает Bull.
 */
@Injectable()
export class CallReportPipelineUseCase {
    private readonly logger = new Logger(CallReportPipelineUseCase.name);
    private readonly llmModel: LlmModel;
    /** Kill-switch объединённого вызова: CALL_REPORT_COMBINED_ANALYSIS=0 → два раздельных. */
    private readonly combinedAnalysisEnabled: boolean;

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionRouter: TranscriptionRouterService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly llmOrchestrator: LlmOrchestratorService,
        private readonly classifyStep: CallClassifyStepService,
        private readonly configService: ConfigService,
    ) {
        const model = this.configService.get<string>('CALL_REPORT_LLM_MODEL');
        this.llmModel = LLM_MODELS.includes(model as LlmModel)
            ? (model as LlmModel)
            : 'gigachat';
        this.combinedAnalysisEnabled = envEnabledByDefault(
            this.configService.get<string>('CALL_REPORT_COMBINED_ANALYSIS'),
        );
    }

    /** Обе стадии подряд (синхронный путь POST /call-report/analyze). */
    async execute(
        payload: CallReportJobPayload,
    ): Promise<CallReportPipelineResult> {
        const transcribed = await this.executeTranscribe(payload);
        return this.executeAnalyze({
            ...payload,
            transcriptionId: transcribed.transcriptionId,
        });
    }

    /**
     * Стадия 1 — транскрибация: upsert строки → аудио из Bitrix →
     * Yandex/Vibecode → персист текста и менеджера. Ошибка → строка в
     * status='error' (звонок снова виден дедупу) и проброс в Bull.
     */
    async executeTranscribe(
        payload: CallReportJobPayload,
    ): Promise<CallReportTranscribeResult> {
        const dedupKey = buildDedupKey(payload.domain, payload.activityId);
        const row = await this.transcriptionStore.startPipeline({
            dedupKey,
            domain: payload.domain,
            activityId: String(payload.activityId),
            callId: payload.callId,
            callStartedAt: payload.callStartedAtIso
                ? new Date(payload.callStartedAtIso)
                : undefined,
            entityType: payload.entityType ?? CALL_REPORT_ENTITY_TYPE_DEAL,
            entityId: String(payload.dealId),
            durationSec: payload.durationSec,
            app: APP_NAME,
        });

        try {
            this.logger.log(
                `Стадия TRANSCRIBE: ${payload.domain}, activity ${payload.activityId} (строка ${row.id})`,
            );
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

            const { text, provider } =
                await this.transcriptionRouter.transcribe({
                    buffer,
                    fileName: audioFile.fileName,
                    domain: payload.domain,
                    durationSec: payload.durationSec,
                });

            // Менеджер (ответственный сделки/лида) — для фильтров отчётов
            // call-report-analytics; недоступность Bitrix шаг не роняет.
            const responsibleId = await this.getResponsibleId(
                bitrix,
                bx,
                payload,
            ).catch((error: Error) => {
                this.logger.warn(
                    `Ответственный ${payload.entityType ?? 'deal'} ${payload.dealId} не получен: ${error.message}`,
                );
                return undefined;
            });

            await this.transcriptionStore.finishPipeline(row.id, {
                status: 'done',
                provider,
                text,
                symbolsCount: String(text.length),
                durationSec: payload.durationSec,
                userId:
                    responsibleId !== undefined
                        ? String(responsibleId)
                        : undefined,
            });
            this.logger.log(
                `Стадия TRANSCRIBE готова: строка ${row.id}, ${provider}, ${text.length} симв.`,
            );
            return { transcriptionId: row.id, provider };
        } catch (error) {
            await this.transcriptionStore
                .finishPipeline(row.id, { status: 'error' })
                .catch(() => undefined);
            throw error;
        }
    }

    /**
     * Стадия 2 — анализ: классификация типа → объединённый LLM-анализ →
     * ais-записи → таймлайн. Текст перечитывается из БД по transcriptionId.
     * LLM-шаги мягкие (не роняют стадию); infra-ошибки пробрасываются в
     * Bull для ретрая — транскрипт при этом уже сохранён и не теряется.
     */
    async executeAnalyze(
        payload: CallReportAnalyzeStagePayload,
    ): Promise<CallReportPipelineResult> {
        this.logger.log(
            `Стадия ANALYZE: ${payload.domain}, activity ${payload.activityId} (строка ${payload.transcriptionId})`,
        );
        const row = await this.transcriptionStore.findPipelineById(
            payload.transcriptionId,
        );
        const text = row.text ?? '';
        if (!text) {
            throw new NotFoundException(
                `Транскрипция ${payload.transcriptionId} без текста — стадия анализа невозможна`,
            );
        }
        const provider = row.provider ?? 'unknown';

        const classification = await this.classifyStep.run(
            text,
            payload,
            payload.transcriptionId,
        );

        const { resume, recomendation } = await this.runLlmAnalysis(
            text,
            payload,
        );

        const resumeSaved = await this.saveAiRecord(
            CALL_RESUME_TYPE,
            resume,
            payload,
            payload.transcriptionId,
        );
        const recomendationSaved = await this.saveAiRecord(
            CALL_RECOMENDATION_TYPE,
            recomendation,
            payload,
            payload.transcriptionId,
        );

        if (resume) {
            const { bitrix } = await this.pbxService.init(payload.domain);
            const bx = new CallAnalysisBitrixService(bitrix);
            await this.addResumeToTimeline(bx, payload, resume).catch(error =>
                this.logger.warn(
                    `Таймлайн не записан (${payload.domain}, deal ${payload.dealId}): ${(error as Error).message}`,
                ),
            );
        }

        return {
            transcriptionId: payload.transcriptionId,
            provider,
            resumeSaved,
            recomendationSaved,
            callType: classification?.callType ?? null,
        };
    }

    /**
     * Резюме + рекомендации: по умолчанию ОДНИМ объединённым вызовом LLM
     * (провайдер сам откатывается на два вызова при непарсибельном ответе);
     * kill-switch CALL_REPORT_COMBINED_ANALYSIS=0 возвращает раздельный путь.
     * Ошибка анализа не роняет конвейер — транскрипт уже сохранён.
     */
    private async runLlmAnalysis(
        text: string,
        payload: CallReportJobPayload,
    ): Promise<{ resume: string | null; recomendation: string | null }> {
        if (this.combinedAnalysisEnabled) {
            try {
                return await this.llmOrchestrator.analyzeCall(
                    this.llmModel,
                    text,
                    payload.domain,
                );
            } catch (error) {
                this.logger.warn(
                    `LLM-анализ не выполнен (activity ${payload.activityId}): ${(error as Error).message}`,
                );
                return { resume: null, recomendation: null };
            }
        }
        const resume = await this.runAnalysis('resume', text, payload);
        const recomendation = await this.runAnalysis(
            'recomendation',
            text,
            payload,
        );
        return { resume, recomendation };
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
        type: typeof CALL_RESUME_TYPE | typeof CALL_RECOMENDATION_TYPE,
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
                entity_type: payload.entityType ?? CALL_REPORT_ENTITY_TYPE_DEAL,
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
        const { bitrix } = await this.pbxService.init(payload.domain);
        const responsibleId = await this.getResponsibleId(bitrix, bx, payload);
        const comment =
            `📞 [b]AI-резюме звонка[/b] (активность #${payload.activityId})\n\n` +
            `${resume.slice(0, 3000)}${resume.length > 3000 ? '...' : ''}`;
        await bitrix.timeline.addTimelineComment({
            ENTITY_ID: payload.dealId,
            ENTITY_TYPE: payload.entityType ?? CALL_REPORT_ENTITY_TYPE_DEAL,
            COMMENT: comment,
            AUTHOR_ID: String(responsibleId ?? 1),
        });
    }

    /** Ответственный сущности-владельца: сделка — через bx, лид — crm.lead.get. */
    private async getResponsibleId(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        bx: CallAnalysisBitrixService,
        payload: CallReportJobPayload,
    ): Promise<number | undefined> {
        if (payload.entityType === CALL_REPORT_ENTITY_TYPE_LEAD) {
            const response = (await bitrix.api.call('crm.lead.get', {
                id: payload.dealId,
            })) as { result?: { ASSIGNED_BY_ID?: string | number } };
            const id = Number(response?.result?.ASSIGNED_BY_ID);
            return Number.isFinite(id) && id > 0 ? id : undefined;
        }
        return bx.getDealResponsibleId(payload.dealId);
    }
}
