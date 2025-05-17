import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class TranscriptionRequestDto {
    @ApiProperty({ description: 'URL of the audio file to transcribe' })
    @IsString()
    @IsNotEmpty()
    fileUrl: string;

    @ApiProperty({ description: 'Name of the audio file' })
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @ApiProperty({ description: 'User ID' })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ description: 'Domain of the portal' })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class TranscriptionResponseDto {
    @ApiProperty({ description: 'Task ID for tracking transcription status' })
    taskId: string;

    @ApiProperty({ description: 'Status of the transcription task', enum: ['started', 'processing', 'done', 'error'] })
    status: string;

    @ApiProperty({ description: 'Transcribed text (if status is done)', required: false })
    text?: string;

    @ApiProperty({ description: 'Error message (if status is error)', required: false })
    error?: string;
} 