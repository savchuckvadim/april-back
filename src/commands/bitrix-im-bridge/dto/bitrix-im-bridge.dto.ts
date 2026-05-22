import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export class TelegramWebhookReplyToMessageDto {
    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    message_id?: number;
}

export class TelegramWebhookChatDto {
    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    id?: number;
}

export class TelegramWebhookMessageDto {
    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    message_id?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    text?: string;

    @ApiPropertyOptional({ type: TelegramWebhookChatDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramWebhookChatDto)
    chat?: TelegramWebhookChatDto;

    @ApiPropertyOptional({ type: TelegramWebhookReplyToMessageDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramWebhookReplyToMessageDto)
    reply_to_message?: TelegramWebhookReplyToMessageDto;
}

export class TelegramWebhookUpdateDto {
    @ApiPropertyOptional()
    @IsNumber()
    @IsOptional()
    update_id?: number;

    @ApiPropertyOptional({ type: TelegramWebhookMessageDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => TelegramWebhookMessageDto)
    message?: TelegramWebhookMessageDto;
}
