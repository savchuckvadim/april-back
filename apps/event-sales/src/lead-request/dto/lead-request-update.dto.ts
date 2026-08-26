import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import {
    EnumLeadNotCaTypeCode,
    EnumLeadSiteStatusCode,
    LEAD_NOT_CA_TYPE_CODES,
    LEAD_SITE_STATUS_CODES,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';

/**
 * Обновление карточки заявки/лида из приложения «Звонки». Все коды —
 * строго типизированные pbx-коды (автокомплит, без magic strings).
 *
 * Правило «не ЦА»: выбор статуса «Не ЦА» без типа отклоняется 400 —
 * тип обязателен (испрашивается фронтом).
 */
export class LeadRequestUpdateDto {
    @ApiProperty({
        description: 'Домен портала Bitrix.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Идентификатор лида.',
        type: Number,
        example: 42,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    @ApiPropertyOptional({
        description: 'Новый статус заявки.',
        type: String,
        enum: LEAD_SITE_STATUS_CODES,
        example: EnumLeadSiteStatusCode.active,
    })
    @IsOptional()
    @IsIn(LEAD_SITE_STATUS_CODES)
    siteStatusCode?: EnumLeadSiteStatusCode;

    /*
     * Ось слита (аудит 2408): siteStageCode / leadStatusCode /
     * relatedBaseStageCode из контракта удалены — поля выведены из оборота.
     */
    @ApiPropertyOptional({
        description:
            'Тип «не ЦА». Обязателен при выборе статуса «Не ЦА» ' +
            '(site_status3).',
        type: String,
        enum: LEAD_NOT_CA_TYPE_CODES,
        example: EnumLeadNotCaTypeCode.apartment,
    })
    @IsOptional()
    @IsIn(LEAD_NOT_CA_TYPE_CODES)
    notCaTypeCode?: EnumLeadNotCaTypeCode;

    @ApiPropertyOptional({
        description: '«Не звонить никогда» (чёрный список).',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    blackShort?: boolean;

    @ApiPropertyOptional({
        description: 'Причина «не звонить никогда».',
        type: String,
        example: 'Просили не звонить',
    })
    @IsOptional()
    @IsString()
    blackShortReason?: string;

    @ApiPropertyOptional({
        description: 'Повлиял на продажу.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    boostSale?: boolean;

    @ApiPropertyOptional({
        description: 'Отправлен отчёт в НПП.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    nppReported?: boolean;

    @ApiPropertyOptional({
        description:
            'Заметка менеджера — отдельной строкой в историю обработки ' +
            'заявки (op_lead_firstprepare_history).',
        type: String,
        example: 'Перезвонить после отпуска ЛПР',
    })
    @IsOptional()
    @IsString()
    historyNote?: string;
}

/** Итог обновления карточки заявки. */
export class LeadRequestUpdateResultDto {
    @ApiProperty({
        description: 'Обновление выполнено.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    success: boolean;

    @ApiProperty({
        description: 'Применённые изменения (человекочитаемо).',
        type: [String],
        example: ['Статус заявки: Ведется активная работа'],
    })
    @IsArray()
    @IsString({ each: true })
    applied: string[];

    @ApiProperty({
        description:
            'Предупреждения graceful degradation (поле не установлено — ' +
            'шаг пропущен).',
        type: [String],
        example: [],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}
