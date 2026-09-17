import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    PBX_SALES_KONSTRUCTOR_FIELD_APP_TYPES,
    PBX_SALES_KONSTRUCTOR_FIELD_CODES,
    PbxSalesKonstructorFieldAppType,
    PbxSalesKonstructorFieldCode,
} from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PMeasureCode } from '@lib/portal-lib/portal/interfaces/portal.interface';

/**
 * Коды ИНН, которые ручка НЕ ПРИНИМАЕТ.
 *
 * `op_inn_pool` — множественное поле-накопитель: присланный массив заменил бы
 * пул ЦЕЛИКОМ, а он копится из лида, компании и реквизитов и терять его
 * нельзя. `op_inn` — решение человека о том, кто плательщик по договору;
 * перетирать его чужой записью тем более нельзя.
 *
 * Менять ИНН можно только через свою ручку, которая умеет объединять пул и
 * вести привязку реквизита (см. ai/tasks/2026-09-17-inn-strategy.md).
 */
export const INN_PROTECTED_CODES: readonly string[] = ['op_inn', 'op_inn_pool'];

/**
 * Коды konstructor-полей сделки, которые принимает ручка.
 *
 * Из канона вычтены поля ИНН: до 17.09.2026 они принимались наравне со
 * всеми, а писатель делал обычный `deal.update` без слияния — то есть один
 * запрос конструктора мог стереть весь пул ИНН сделки.
 */
export const DEAL_SEND_FIELD_CODES = Object.values(
    PBX_SALES_KONSTRUCTOR_FIELD_CODES,
).filter(code => !INN_PROTECTED_CODES.includes(code));

/** Назначения полей канона: инфоблочное описание, продуктовое поле и т.д. */
export const DEAL_SEND_FIELD_APP_TYPES = Object.values(
    PBX_SALES_KONSTRUCTOR_FIELD_APP_TYPES,
);

const DEAL_CATEGORY_CODES = Object.values(PbxDealCategoryCodeEnum);

/**
 * Значение поля сделки в семантике конструктора: код из pbx-канона, а не
 * `UF_CRM_*`. Реальный идентификатор поля резолвит бэк по портальной схеме —
 * фронт больше не таскает карту id из Google-таблицы.
 */
export class DealSendFieldDto {
    @ApiProperty({
        description: 'Код поля сделки из pbx-канона конструктора',
        enum: DEAL_SEND_FIELD_CODES,
        example: 'complect_name',
    })
    @IsIn(DEAL_SEND_FIELD_CODES)
    code: PbxSalesKonstructorFieldCode;

    @ApiProperty({
        description:
            'Назначение поля. Обязателен там, где одному коду соответствует несколько полей сделки: `consalting` — это и инфоблочное описание (update), и продуктовое поле (product)',
        enum: DEAL_SEND_FIELD_APP_TYPES,
        required: false,
    })
    @IsOptional()
    @IsIn(DEAL_SEND_FIELD_APP_TYPES)
    appType?: PbxSalesKonstructorFieldAppType;

    @ApiProperty({
        description:
            'Значение поля. Строка, число, флаг или массив строк — по типу поля на портале',
        oneOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } },
        ],
    })
    value: string | number | boolean | string[];
}

/**
 * Семантические коды единиц измерения — колонка `code` таблицы `measures`
 * («для APP», см. миграцию 2024_07_22_070716_create_measures_table).
 * Реальный код для Битрикса лежит в `portal_measure.bitrixId` и свой у каждого
 * портала, поэтому семантический код резолвится через портальную схему.
 */
export const DEAL_SEND_MEASURE_CODES = [
    'month',
    'piece',
    'licHalf',
    'licYear',
    'licTwoYears',
    'abonHalf',
    'abonYear',
    'abonTwoYears',
] as const satisfies readonly PMeasureCode[];

/**
 * Товарная строка сделки — поля в точности как у легаси
 * (`crm.item.productrow.set`).
 *
 * Про единицы измерения: в Битриксе у единицы есть внутренний ID и отдельный
 * «Код» (у april-garant «Месяц» — ID 11, код 15). В pbx этот код хранится в
 * `portal_measure.bitrixId`, и именно его конструктор кладёт в
 * `price.measure.id` / `price.measure.code`. Поэтому `measureCode` здесь —
 * число-код Битрикса, а не семантика; семантический код можно прислать
 * альтернативно в `measureSemanticCode`, и бэк сам достанет `bitrixId`.
 */
export class DealSendProductRowDto {
    @ApiProperty({
        description:
            'ID товара в Битриксе (легаси: product.id || product.number)',
        required: false,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    productId?: number;

    @ApiProperty({ description: 'Название товара' })
    @IsNotEmpty()
    @IsString()
    productName: string;

    @ApiProperty({ description: 'Цена за единицу со скидкой' })
    @IsNumber()
    price: number;

    @ApiProperty({ description: 'Количество' })
    @IsNumber()
    quantity: number;

    @ApiProperty({
        description:
            'Код единицы измерения в Битриксе (portal_measure.bitrixId). Приоритетнее семантического',
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    measureCode?: number;

    @ApiProperty({
        description: 'Внутренний ID единицы измерения в Битриксе',
        required: false,
    })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    measureId?: number;

    @ApiProperty({
        description:
            'Семантический код единицы (measures.code). Используется, только если не передан measureCode',
        enum: DEAL_SEND_MEASURE_CODES,
        required: false,
    })
    @IsOptional()
    @IsIn(DEAL_SEND_MEASURE_CODES)
    measureSemanticCode?: PMeasureCode;

    @ApiProperty({ description: 'Вид поставки', required: false })
    @IsOptional()
    @IsString()
    supply?: string;

    @ApiProperty({ description: 'Цена до скидки', required: false })
    @IsOptional()
    @IsNumber()
    priceNetto?: number;

    @ApiProperty({ description: 'Сумма скидки', required: false })
    @IsOptional()
    @IsNumber()
    discountSum?: number;

    @ApiProperty({ description: 'Порядок строки', required: false })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    sort?: number;
}

/**
 * Отправка сделки из конструктора в Bitrix.
 *
 * Заменяет легаси `garant-app.ru/api/konstructor/bitrix/deal/update`: тот
 * принимал готовые `UF_CRM_*`, собранные фронтом из Google-таблицы. Здесь
 * приходят только коды полей — карта id живёт в pbx.
 */
export class DealSendDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Сделка. Не передана — сделка будет создана',
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    dealId?: number | null;

    @ApiProperty({
        description: 'Ответственный',
        required: false,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    userId?: number | null;

    @ApiProperty({ description: 'Компания', required: false, nullable: true })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    companyId?: number | null;

    @ApiProperty({
        description: 'Название сделки (нужно при создании)',
        required: false,
    })
    @IsOptional()
    @IsString()
    dealName?: string;

    @ApiProperty({
        description: 'Воронка сделки; по умолчанию sales_base',
        enum: DEAL_CATEGORY_CODES,
        required: false,
    })
    @IsOptional()
    @IsIn(DEAL_CATEGORY_CODES)
    categoryCode?: PbxDealCategoryCodeEnum;

    @ApiProperty({
        description: 'Открытая сделка (доступна всем)',
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    opened?: boolean;

    @ApiProperty({ type: [DealSendFieldDto], description: 'Поля сделки' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DealSendFieldDto)
    fields: DealSendFieldDto[];

    @ApiProperty({
        type: [DealSendProductRowDto],
        description: 'Товарные строки; не переданы — строки не трогаем',
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DealSendProductRowDto)
    productRows?: DealSendProductRowDto[];
}

/**
 * Почему значение поля не записано:
 * - `not_on_portal` — такого поля нет в схеме портала;
 * - `ambiguous_code` — коду соответствует несколько полей сделки, а `appType`
 *   не передан (так устроен `consalting`);
 * - `inn_protected` — поле ИНН, менять его этой ручкой нельзя
 *   (см. {@link INN_PROTECTED_CODES}).
 */
export const DEAL_FIELD_SKIP_REASONS = [
    'not_on_portal',
    'ambiguous_code',
    'inn_protected',
] as const;

export type DealFieldSkipReason = (typeof DEAL_FIELD_SKIP_REASONS)[number];

/** Поле, значение которого не записано, и почему. */
export class SkippedDealFieldDto {
    @ApiProperty({ description: 'Код поля' })
    code: string;

    @ApiProperty({
        description: 'Причина',
        enum: DEAL_FIELD_SKIP_REASONS,
    })
    reason: DealFieldSkipReason;
}

/**
 * Сделка создана/найдена синхронно (фронту нужен её id), запись полей и
 * товарных строк уходит в очередь — как в легаси.
 */
export class DealSendResponseDto {
    @ApiProperty({ description: 'Сделка, в которую пишем' })
    dealId: number;

    @ApiProperty({ description: 'Сделка была создана этим вызовом' })
    created: boolean;

    @ApiProperty({
        description:
            'Поля, значения которых записаны не были: not_on_portal — поля нет в схеме портала, ambiguous_code — коду соответствует несколько полей и не передан appType',
        type: [SkippedDealFieldDto],
    })
    skipped: SkippedDealFieldDto[];
}
