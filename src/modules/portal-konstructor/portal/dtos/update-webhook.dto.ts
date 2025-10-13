import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateWebhookDto {
    @ApiProperty({ description: 'The webhook URL', example: 'https://example.com/webhook' })
    @IsString()
    webhook: string;
}
