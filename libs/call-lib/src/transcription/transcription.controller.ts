import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import {
    TranscriptionRequestDto,
    TranscriptionResponseDto,
} from './dto/transcription.dto';
import { StartTranscriptionUseCase } from './use-cases/start-transcription.use-case';
import { GetTranscriptionResultUseCase } from './use-cases/get-transcription-result.use-case';

@ApiTags('transcription')
@Controller('transcription')
export class TranscriptionController {
    private readonly logger = new Logger(TranscriptionController.name);

    constructor(
        private readonly startTranscriptionUseCase: StartTranscriptionUseCase,
        private readonly getTranscriptionResultUseCase: GetTranscriptionResultUseCase,
    ) {}

    @Post()
    @ApiOperation({ summary: 'Start audio transcription' })
    @ApiResponse({
        status: 200,
        description: 'Transcription started successfully',
        type: TranscriptionResponseDto,
    })
    async startTranscription(
        @Body() dto: TranscriptionRequestDto,
    ): Promise<TranscriptionResponseDto> {
        try {
            return await this.startTranscriptionUseCase.execute(dto);
        } catch (error) {
            this.logger.error('Error starting transcription:', error);
            throw error;
        }
    }

    @Get(':taskId')
    @ApiOperation({ summary: 'Get transcription status and result' })
    @ApiParam({ name: 'taskId', description: 'Task ID to check status' })
    @ApiResponse({
        status: 200,
        description: 'Returns transcription status and result if available',
        type: TranscriptionResponseDto,
    })
    async getTranscriptionResult(
        @Param('taskId') taskId: string,
    ): Promise<TranscriptionResponseDto> {
        return await this.getTranscriptionResultUseCase.execute(taskId);
    }
}
