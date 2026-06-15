import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstallEntityFieldDto } from '../../shared';

/**
 * DTO мониторинга полей ЗАДАЧИ. У задач нет сущности в PortalDB, поэтому слоёв
 * два: шаблон-константа (TASK_FIELDS) и живой Bitrix (UF_TASK_*).
 *
 * Response-DTO документируют ключевые поля живого ответа Bitrix; объект
 * приходит «как есть» (raw ITaskUserField), лишние поля Swagger не показывает.
 */

export const PBX_TASK_FIELD_STATUS_VALUES = [
    'installed',
    'not_installed',
] as const;
export type PbxTaskFieldStatus = (typeof PBX_TASK_FIELD_STATUS_VALUES)[number];

export class BxTaskFieldDto {
    @ApiProperty({
        description: 'ID определения пользовательского поля задачи в Bitrix.',
        example: '123',
        type: String,
    })
    ID!: string;

    @ApiProperty({
        description: 'Системное имя поля в Bitrix (UF_TASK_*).',
        example: 'UF_TASK_EVENT_COMMENT',
        type: String,
    })
    FIELD_NAME!: string;

    @ApiProperty({
        description: 'Тип пользовательского поля задачи Bitrix.',
        example: 'string',
        type: String,
    })
    USER_TYPE_ID!: string;

    @ApiPropertyOptional({
        description: 'XML_ID поля (стабильный внешний идентификатор).',
        example: 'event_comment',
        type: String,
    })
    XML_ID?: string | null;

    @ApiProperty({
        description: 'Порядок сортировки поля.',
        example: '100',
        type: String,
    })
    SORT!: string;

    @ApiProperty({
        description: 'Признак множественности поля (MULTIPLE).',
        example: 'N',
        enum: ['Y', 'N'],
    })
    MULTIPLE!: 'Y' | 'N';

    @ApiProperty({
        description: 'Признак обязательности поля (MANDATORY).',
        example: 'N',
        enum: ['Y', 'N'],
    })
    MANDATORY!: 'Y' | 'N';
}

export class BxTaskFieldsListResponseDto {
    @ApiProperty({
        description: 'Домен портала, у которого читались поля.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({
        description:
            'Пользовательские поля задачи из живого Bitrix (UF_TASK_*).',
        type: [BxTaskFieldDto],
    })
    fields!: BxTaskFieldDto[];
}

export class PbxTaskMergedFieldDto {
    @ApiProperty({
        description:
            'Полное имя поля в Bitrix (UF_TASK_*) — ключ склейки слоёв.',
        example: 'UF_TASK_EVENT_COMMENT',
        type: String,
    })
    name!: string;

    @ApiProperty({
        description: 'Шаблон поля из констант (TASK_FIELDS).',
        type: InstallEntityFieldDto,
    })
    template!: InstallEntityFieldDto;

    @ApiPropertyOptional({
        description: 'Живое поле из Bitrix. null — поле не установлено.',
        type: BxTaskFieldDto,
        nullable: true,
    })
    bx!: BxTaskFieldDto | null;

    @ApiProperty({
        description:
            'Статус: installed — поле есть в Bitrix; not_installed — есть ' +
            'только в шаблоне.',
        example: 'installed',
        enum: PBX_TASK_FIELD_STATUS_VALUES,
    })
    status!: PbxTaskFieldStatus;
}

export class PbxTaskMonitoringSummaryDto {
    @ApiProperty({
        description: 'Всего полей шаблона.',
        example: 1,
        type: Number,
    })
    total!: number;

    @ApiProperty({
        description: 'Полей шаблона, установленных в Bitrix.',
        example: 1,
        type: Number,
    })
    installed!: number;

    @ApiProperty({
        description: 'Полей шаблона, отсутствующих в Bitrix.',
        example: 0,
        type: Number,
    })
    notInstalled!: number;

    @ApiProperty({
        description: 'Живых UF_TASK_-полей Bitrix без пары в шаблоне.',
        example: 0,
        type: Number,
    })
    untracked!: number;
}

export class PbxTaskMonitoringResultDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({ type: PbxTaskMonitoringSummaryDto })
    summary!: PbxTaskMonitoringSummaryDto;

    @ApiProperty({
        description: 'Склейка полей шаблона с живым Bitrix.',
        type: [PbxTaskMergedFieldDto],
    })
    mergedFields!: PbxTaskMergedFieldDto[];

    @ApiProperty({
        description: 'Живые UF_TASK_-поля Bitrix без пары в шаблоне.',
        type: [BxTaskFieldDto],
    })
    bitrixFieldsWithoutTemplate!: BxTaskFieldDto[];
}

export class PbxTaskMonitoringPortalErrorDto {
    @ApiProperty({ description: 'Домен портала.', type: String })
    domain!: string;

    @ApiProperty({
        description: 'Текст ошибки получения данных по порталу.',
        type: String,
    })
    error!: string;
}

export class PbxTaskMonitoringAllResponseDto {
    @ApiProperty({
        description: 'Результаты по каждому доступному порталу.',
        type: [PbxTaskMonitoringResultDto],
    })
    perPortal!: PbxTaskMonitoringResultDto[];

    @ApiProperty({
        description: 'Порталы, по которым данные получить не удалось.',
        type: [PbxTaskMonitoringPortalErrorDto],
    })
    errors!: PbxTaskMonitoringPortalErrorDto[];
}
