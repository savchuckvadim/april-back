import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaskWebhookAuthDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, с которого пришёл webhook.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    domain: string;
}

export class TaskWebhookFieldsAfterDto {
    @ApiProperty({
        description: 'ID задачи в Bitrix24 (приходит строкой из form-data).',
        type: String,
        example: '136086',
    })
    @IsString()
    ID: string;

    @ApiPropertyOptional({
        description:
            'Статус задачи после обновления. "5" означает что задача завершена.',
        type: String,
        example: '5',
    })
    @IsOptional()
    @IsString()
    STATUS?: string;
}

export class TaskWebhookDataDto {
    @ApiPropertyOptional({
        description: 'Состояние полей задачи после изменения.',
        type: TaskWebhookFieldsAfterDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => TaskWebhookFieldsAfterDto)
    FIELDS_AFTER?: TaskWebhookFieldsAfterDto;
}

export class TaskWebhookDto {
    @ApiProperty({
        description: 'Авторизация портала (Bitrix передаёт auth[domain]=...).',
        type: TaskWebhookAuthDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => TaskWebhookAuthDto)
    auth: TaskWebhookAuthDto;

    @ApiPropertyOptional({
        description:
            'Имя события Bitrix, например "ONTASKUPDATE" или "ONTASKADD".',
        type: String,
        example: 'ONTASKUPDATE',
    })
    @IsOptional()
    @IsString()
    event?: string;

    @ApiProperty({
        description: 'Данные события (поля задачи до/после изменения).',
        type: TaskWebhookDataDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => TaskWebhookDataDto)
    data: TaskWebhookDataDto;
}
