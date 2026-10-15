import { ApiProperty } from '@nestjs/swagger';
import {
    KPI_DIGEST_COMPLECT_SOURCES,
    KPI_DIGEST_PRES_DAY_STATUSES,
    KpiDigestComplectSource,
    KpiDigestPresDayStatus,
} from '../constants/digest.const';

/**
 * Презентации и продажи дня (исходящие DTO, без валидаторов). Источник —
 * сделки воронки «ОП Презентации» и выигранные сделки «ОП Основная»;
 * комментарии — записи списка sales_kpi, привязанные к сделке.
 */

/** Ссылка на сущность CRM с названием. */
export class KpiDigestEntityRefDto {
    @ApiProperty({ description: 'ID сущности Bitrix.', example: 38947 })
    id: number;

    @ApiProperty({ description: 'Название (компания, сделка, лид) или ФИО контакта.', example: 'ООО Ромашка' })
    title: string;
}

/** Одна презентация (сделка «ОП Презентации»), попавшая в день. */
export class KpiDigestPresentationDto {
    @ApiProperty({ description: 'ID сделки презентации.', example: 272527 })
    dealId: number;

    @ApiProperty({ description: 'Название сделки.', example: 'Презентация Юрист' })
    title: string;

    @ApiProperty({
        description: 'Код стадии (spres_plan / spres_pending / spres_success / spres_fail / spres_noresult / spres_new).',
        type: String,
        nullable: true,
        example: 'spres_success',
    })
    stageCode: string | null;

    @ApiProperty({ description: 'Название стадии с портала.', type: String, nullable: true, example: 'Презентация проведена' })
    stageName: string | null;

    @ApiProperty({
        description: 'Что произошло с презентацией в выбранный день.',
        enum: KPI_DIGEST_PRES_DAY_STATUSES,
        example: 'held',
    })
    dayStatus: KpiDigestPresDayStatus;

    @ApiProperty({ description: 'Ответственный (ASSIGNED_BY_ID).', example: 2077 })
    assignedId: number;

    @ApiProperty({ description: 'Кто запланировал (xo_created), если известно.', type: Number, nullable: true, example: 2077 })
    planAuthorId: number | null;

    @ApiProperty({ description: 'Дата, на которую назначена презентация, YYYY-MM-DD HH:mm:ss.', type: String, nullable: true })
    planDate: string | null;

    @ApiProperty({ description: 'Когда презентацию запланировали.', type: String, nullable: true })
    planCreatedAt: string | null;

    @ApiProperty({ description: 'Когда проведена.', type: String, nullable: true })
    doneDate: string | null;

    @ApiProperty({ description: 'Создание сделки.', type: String, nullable: true })
    createdAt: string | null;

    @ApiProperty({ description: 'Последняя смена стадии.', type: String, nullable: true })
    movedAt: string | null;

    @ApiProperty({ description: 'Час события в дне (0..23) для почасового графика.', type: Number, nullable: true, example: 11 })
    hour: number | null;

    @ApiProperty({ description: 'Стояла на этот день до его начала (запланирована заранее).', example: true })
    plannedAtStart: boolean;

    @ApiProperty({ description: 'Спонтанная (незапланированная) презентация.', example: false })
    spontaneous: boolean;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    company: KpiDigestEntityRefDto | null;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    contact: KpiDigestEntityRefDto | null;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    lead: KpiDigestEntityRefDto | null;

    @ApiProperty({ description: 'Основная сделка (to_base_sales).', type: KpiDigestEntityRefDto, nullable: true })
    baseDeal: KpiDigestEntityRefDto | null;

    @ApiProperty({ description: 'Наименование комплекта.', type: String, nullable: true, example: 'Юрист Максимум' })
    complectName: string | null;

    @ApiProperty({
        description: 'Откуда взяты комплект и сумма: с самой сделки презентации или с основной сделки.',
        enum: KPI_DIGEST_COMPLECT_SOURCES,
        nullable: true,
        example: 'base',
    })
    complectSource: KpiDigestComplectSource | null;

    @ApiProperty({ description: 'Сумма (сделки презентации, иначе основной сделки).', example: 144000 })
    sum: number;

    @ApiProperty({ description: 'Названия товаров (комплектов) в товарных строках.', type: [String] })
    productNames: string[];

    @ApiProperty({ description: 'Комментарий при планировании (запись списка KPI).', type: String, nullable: true })
    planComment: string | null;

    @ApiProperty({ description: 'Комментарий после отработки (запись списка KPI за день).', type: String, nullable: true })
    reportComment: string | null;

    @ApiProperty({ description: 'Код причины нерезультата.', type: String, nullable: true })
    noresultReason: string | null;

    @ApiProperty({ description: 'Последние строки истории сделки (op_mhistory).', type: [String] })
    history: string[];
}

/** Презентация, связанная с продажей (через to_base_sales). */
export class KpiDigestSalePresentationDto {
    @ApiProperty({ example: 272527 })
    dealId: number;

    @ApiProperty({ example: 'Презентация Юрист' })
    title: string;

    @ApiProperty({ example: 2077 })
    assignedId: number;

    @ApiProperty({ type: String, nullable: true, example: 'Презентация проведена' })
    stageName: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Когда проведена.' })
    doneDate: string | null;
}

/** Продажа дня: выигранная сделка «ОП Основная» с CLOSEDATE в этот день. */
export class KpiDigestSaleDto {
    @ApiProperty({ example: 267683 })
    dealId: number;

    @ApiProperty({ example: 'ООО Ромашка — Гарант' })
    title: string;

    @ApiProperty({ example: 2077 })
    assignedId: number;

    @ApiProperty({ type: String, nullable: true, description: 'CLOSEDATE, YYYY-MM-DD HH:mm:ss.' })
    closeDate: string | null;

    @ApiProperty({ description: 'Сумма сделки (OPPORTUNITY).', example: 144000 })
    opportunity: number;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    company: KpiDigestEntityRefDto | null;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    contact: KpiDigestEntityRefDto | null;

    @ApiProperty({ type: KpiDigestEntityRefDto, nullable: true })
    lead: KpiDigestEntityRefDto | null;

    @ApiProperty({ type: String, nullable: true, example: 'Юрист Максимум' })
    complectName: string | null;

    @ApiProperty({ type: [String] })
    productNames: string[];

    @ApiProperty({ description: 'Последние строки истории сделки.', type: [String] })
    history: string[];

    @ApiProperty({ description: 'Презентации этой продажи (сделки «ОП Презентации» с to_base_sales).', type: [KpiDigestSalePresentationDto] })
    presentations: KpiDigestSalePresentationDto[];
}

export class KpiDigestPresentationsDto {
    @ApiProperty({ description: 'Презентации дня по запрошенным сотрудникам.', type: [KpiDigestPresentationDto] })
    items: KpiDigestPresentationDto[];

    @ApiProperty({ description: 'Продажи дня по запрошенным сотрудникам.', type: [KpiDigestSaleDto] })
    sales: KpiDigestSaleDto[];

    @ApiProperty({ description: 'Какая-то выборка обрезана по лимиту — данные неполные.', example: false })
    truncated: boolean;
}
