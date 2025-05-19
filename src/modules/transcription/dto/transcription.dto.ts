import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

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

    @ApiProperty({ description: 'User name' })
    @IsString()
    @IsNotEmpty()
    userName: string;

    @ApiProperty({ description: 'Application name' })
    @IsString()
    @IsNotEmpty()
    appName: string;

    @ApiProperty({ description: 'Activity ID' })
    @IsString()
    @IsNotEmpty()
    activityId: string;

    @ApiProperty({ description: 'File ID' })
    @IsString()
    @IsNotEmpty()
    fileId: string;

    @ApiProperty({ description: 'Duration of the audio file' })
    @IsString()
    @IsNotEmpty()
    duration: string;

    @ApiProperty({ description: 'Department' })
    @IsString()
    @IsNotEmpty()
    department: string;

    @ApiProperty({ description: 'Entity type' })
    @IsString()
    @IsNotEmpty()
    entityType: string;

    @ApiProperty({ description: 'Entity ID' })
    @IsString()
    @IsNotEmpty()
    entityId: string;

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

    @ApiProperty({ description: 'Transcription ID' })
    transcriptionId?: number;
}


