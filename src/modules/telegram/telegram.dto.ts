import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class TelegramSendMessagePublicDto {
    @ApiProperty({ description: 'Application name', type: String })
    @IsString()
    app: string;

    @ApiProperty({ description: 'Text message' })
    @IsString()
    @IsNotEmpty()
    text: string;

    @ApiProperty({ description: 'Domain', example: 'example.bitrix24.ru' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'User ID' })
    @IsString()
    userId: string;
}
