import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class StartBridgeDto {
    @ApiProperty({ example: 'gsr.bitrix24.ru' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({ example: 'savchuckvadim@gmail.com' })
    @IsString()
    @IsOptional()
    email?: string;

    @ApiPropertyOptional({
        description:
            'When true, add this domain to scheduled polling list as well',
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    enableScheduledPolling?: boolean;
}

export class PollDomainDto {
    @ApiProperty({ example: 'gsr.bitrix24.ru' })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class TelegramWebhookMessageDto {
    @ApiPropertyOptional()
    message_id?: number;

    @ApiPropertyOptional()
    text?: string;

    @ApiPropertyOptional({ type: Object })
    chat?: {
        id?: number;
    };

    @ApiPropertyOptional({ type: Object })
    reply_to_message?: {
        message_id?: number;
    };
}

export class TelegramWebhookUpdateDto {
    @ApiPropertyOptional()
    update_id?: number;

    @ApiPropertyOptional({ type: TelegramWebhookMessageDto })
    message?: TelegramWebhookMessageDto;
}
