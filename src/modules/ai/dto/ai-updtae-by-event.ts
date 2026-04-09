import { TranscriptionBaseDto } from '@/modules/transcription/dto/transcription.store.dto';
import { AiUpdateDto } from './ai-update.dto';
import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAiByEventDto {
    @ApiProperty({ description: 'AI update data' })
    @ValidateNested()
    @Type(() => AiUpdateDto)
    ai: AiUpdateDto;

    @ApiProperty({ description: 'Transcription update data' })
    @ValidateNested()
    @Type(() => TranscriptionBaseDto)
    transcription: TranscriptionBaseDto;
}
