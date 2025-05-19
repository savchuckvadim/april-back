import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
import { TranscribeJobHandlerId } from 'src/modules/queue/constants/transcribe-job-handler-id.enum';
import { StreamingTranscriptionService } from '../services/streaming-transcription.service';
import { TranscriptionService } from '../services/transcription.service';

interface TranscribeAudioJobData {
    fileUrl: string;
    fileName: string;
    taskId: string;
    domain: string;
    userId: string;
    userName: string;
    appName: string;
    activityId: string;
    fileId: string;
    duration: string;
    department: string;
    entityType: string;
    entityId: string;

}

@Processor(QueueNames.TRANSCRIBE_AUDIO)
export class TranscribeAudioProcessor {
    private readonly logger = new Logger(TranscribeAudioProcessor.name);

    constructor(
        private readonly transcriptionService: TranscriptionService
    ) { }

    @Process(TranscribeJobHandlerId.TRANSCRIBE)
    async handleTranscription(job: Job<TranscribeAudioJobData>) {
        try {
            this.logger.debug(`Processing transcription job for taskId: ${job.data.taskId}`);

            const { 
                fileUrl, 
                fileName, 
                taskId, 
                domain, 
                userId, 
                userName,
                appName,
                activityId,
                fileId,
                duration,
                department,
                entityType,
                entityId
             } = job.data;

            await this.transcriptionService.transcribe(
                fileUrl,
                fileName,
                taskId,
                domain,
                userId,
                userName,
                appName,
                activityId,
                fileId,
                duration,
                department,
                entityType,
                entityId
            );

            this.logger.debug(`Completed transcription job for taskId: ${job.data.taskId}`);
        } catch (error) {
            this.logger.error(`Error processing transcription job: ${error.message}`, error.stack);
            throw error;
        }
    }
} 