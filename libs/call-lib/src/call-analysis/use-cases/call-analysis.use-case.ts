import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import { VibeCodeClient } from '../clients/vibecode.client';
import {
    AudioFile,
    CallAnalysisBitrixService,
} from '../services/call-analysis-bitrix.service';
import { EventFlowMapperService } from '../services/event-flow-mapper.service';
import { FlowDtoStorageService } from '../services/flow-dto-storage.service';
import {
    CallSalesAnalysisDto,
    CallSalesAnalysisResultDto,
} from '../dto/call-sales-analysis.dto';
import {
    AnalyzeActivityDto,
    AnalyzeDealCallsDto,
} from '../dto/call-analysis-request.dto';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { TranscriptionBaseDto } from '../../transcription/dto/transcription.store.dto';
import { AiService } from '../../ai/services/ai.service';
import { CALL_REPORT_ENTITY_TYPE_DEAL } from '../../transcription/types/transcription-pipeline.types';

@Injectable()
export class CallAnalysisUseCase {
    private readonly logger = new Logger(CallAnalysisUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly vibecode: VibeCodeClient,
        private readonly flowMapper: EventFlowMapperService,
        private readonly flowStorage: FlowDtoStorageService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async forDeal(dto: AnalyzeDealCallsDto): Promise<CallSalesAnalysisDto[]> {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const bx = new CallAnalysisBitrixService(bitrix);

        const activities = await bx.getCallActivities(
            dto.dealId,
            dto.limit ?? 3,
        );
        if (!activities.length) {
            this.logger.warn(`No call activities found for deal ${dto.dealId}`);
            return [];
        }

        const audioFiles = await bx.getAudioFiles(activities);
        if (!audioFiles.length) {
            this.logger.warn(`No audio files found for deal ${dto.dealId}`);
            return [];
        }

        const responsibleId = await bx.getDealResponsibleId(dto.dealId);
        const results: CallSalesAnalysisDto[] = [];

        for (const audioFile of audioFiles) {
            const result = await this.processAudioFile(
                bx,
                audioFile,
                dto.dealId,
                responsibleId,
                dto.domain,
            );
            results.push(result);
        }

        return results;
    }

    async forActivity(dto: AnalyzeActivityDto): Promise<CallSalesAnalysisDto> {
        const { bitrix } = await this.pbxService.init(dto.domain);
        const bx = new CallAnalysisBitrixService(bitrix);

        const activity = await bx.getActivityById(dto.activityId);
        if (!activity) {
            throw new NotFoundException(`Activity ${dto.activityId} not found`);
        }

        const audioFiles = await bx.getAudioFiles([activity]);
        if (!audioFiles.length) {
            throw new NotFoundException(
                `No audio files in activity ${dto.activityId}`,
            );
        }

        const responsibleId = await bx.getDealResponsibleId(dto.dealId);
        return this.processAudioFile(
            bx,
            audioFiles[0],
            dto.dealId,
            responsibleId,
            dto.domain,
        );
    }

    private async processAudioFile(
        bx: CallAnalysisBitrixService,
        audioFile: AudioFile,
        dealId: number,
        responsibleId: number,
        domain: string,
    ): Promise<CallSalesAnalysisDto> {
        this.logger.log(
            `Processing audio file ${audioFile.fileName} for deal ${dealId}`,
        );

        const buffer = await bx.downloadAudioBuffer(audioFile.downloadUrl);
        const transcript = await this.vibecode.transcribeAudio(
            buffer,
            audioFile.fileName,
        );
        const analysis = await this.vibecode.analyzeTranscript(transcript);

        await bx.saveAnalysisToTimeline(
            dealId,
            analysis,
            transcript,
            audioFile.activityId,
            responsibleId,
        );
        const confirmationTaskId = await bx.createConfirmationTask(
            dealId,
            responsibleId,
            analysis,
            audioFile.activityId,
        );
        await bx.notifyResponsible(
            responsibleId,
            confirmationTaskId,
            analysis,
            audioFile.activityId,
        );

        const flowDto = this.flowMapper.toFlowDto(
            analysis,
            domain,
            responsibleId,
        );

        if (confirmationTaskId > 0) {
            await this.flowStorage.save(domain, confirmationTaskId, flowDto);
        }

        await this.persistResult(
            domain,
            audioFile,
            dealId,
            responsibleId,
            transcript,
            analysis,
        );

        return {
            activityId: audioFile.activityId,
            dealId,
            transcript,
            analysis,
            confirmationTaskId,
            flowDto,
        };
    }

    /**
     * Накопление результатов ручного анализа в БД (transcriptions + ais).
     * dedup_key здесь НЕ пишется: повторный ручной запуск — легитимный
     * сценарий, дедупликация действует только в автоконвейере call-report.
     * Ошибка персиста не роняет основной пайплайн — только warn в лог.
     */
    private async persistResult(
        domain: string,
        audioFile: AudioFile,
        dealId: number,
        responsibleId: number,
        transcript: string,
        analysis: CallSalesAnalysisResultDto,
    ): Promise<void> {
        try {
            const transcription = await this.transcriptionStore.create({
                provider: 'bitrix-vibecode',
                activityId: String(audioFile.activityId),
                fileId: String(audioFile.fileId),
                inComment: true,
                status: 'done',
                text: transcript,
                symbolsCount: String(transcript.length),
                domain,
                userId: String(responsibleId),
                app: 'call-analysis',
                entityType: CALL_REPORT_ENTITY_TYPE_DEAL,
                entityId: String(dealId),
            } as TranscriptionBaseDto);

            await this.aiService.create({
                provider: 'bitrix-vibecode',
                model: 'bitrix/bitrixgpt-5.5',
                type: 'call-analysis',
                status: 'done',
                result: JSON.stringify(analysis),
                user_result: JSON.parse(
                    JSON.stringify(analysis),
                ) as Prisma.JsonValue,
                activity_id: String(audioFile.activityId),
                entity_type: CALL_REPORT_ENTITY_TYPE_DEAL,
                entity_id: dealId,
                user_id: responsibleId,
                domain,
                app: 'call-analysis',
                transcription_id: transcription.id,
            });
        } catch (error) {
            this.logger.warn(
                `Не удалось сохранить результат анализа в БД: ${(error as Error).message}`,
            );
        }
    }
}
