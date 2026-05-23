import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx/pbx.service';
import { VibeCodeClient } from '../clients/vibecode.client';
import {
    AudioFile,
    CallAnalysisBitrixService,
} from '../services/call-analysis-bitrix.service';
import { EventFlowMapperService } from '../services/event-flow-mapper.service';
import { FlowDtoStorageService } from '../services/flow-dto-storage.service';
import { CallSalesAnalysisDto } from '../dto/call-sales-analysis.dto';
import {
    AnalyzeActivityDto,
    AnalyzeDealCallsDto,
} from '../dto/call-analysis-request.dto';

@Injectable()
export class CallAnalysisUseCase {
    private readonly logger = new Logger(CallAnalysisUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly vibecode: VibeCodeClient,
        private readonly flowMapper: EventFlowMapperService,
        private readonly flowStorage: FlowDtoStorageService,
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

        return {
            activityId: audioFile.activityId,
            dealId,
            transcript,
            analysis,
            confirmationTaskId,
            flowDto,
        };
    }
}
