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
    MaxLength,
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
import { IsDealFieldValue } from './is-deal-field-value.validator';

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
/** Вид договора главной строки — выбирает тексты поставки (услуги / лицензионный / абонентский). */
export const DEAL_SEND_CONTRACT_KINDS = [
    'service',
    'lic',
    'abon',
    'key',
] as const;
export type DealSendContractKind = (typeof DEAL_SEND_CONTRACT_KINDS)[number];

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
    @IsDealFieldValue()
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

/** Куда писать: сделка (по умолчанию) или элемент смарта, привязанный к сделке. */
export const DEAL_SEND_TARGET_KINDS = ['deal', 'smart'] as const;
export type DealSendTargetKind = (typeof DEAL_SEND_TARGET_KINDS)[number];

export class DealSendTargetDto {
    @ApiProperty({
        description:
            'deal — поля и строки в сделку; smart — в элемент смарта (сервисный отдел: «предложение на будущий период»)',
        enum: DEAL_SEND_TARGET_KINDS,
        example: 'smart',
    })
    @IsIn(DEAL_SEND_TARGET_KINDS)
    kind: DealSendTargetKind;

    @ApiProperty({
        description: 'Тип смарта в портальной схеме (service_offer)',
        type: String,
        required: false,
    })
    @IsOptional()
    @IsString()
    smartType?: string;

    @ApiProperty({
        description:
            'Элемент смарта; не передан — будет создан и привязан к сделке (parentId2)',
        type: Number,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsNumber()
    smartId?: number | null;

    @ApiProperty({
        description:
            'Название элемента смарта («Комплект · поставка · договор»)',
        type: String,
        required: false,
    })
    @IsOptional()
    @IsString()
    title?: string;
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
        type: Number,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    dealId?: number | null;

    @ApiProperty({
        description: 'Ответственный',
        required: false,
        nullable: true,
        type: Number,
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    userId?: number | null;

    @ApiProperty({
        description: 'Компания',
        required: false,
        nullable: true,
        type: Number,
    })
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

    @ApiProperty({
        description:
            'Код поставки главной строки (internet_5, proxima_flash, X-ОД x_internet_7): по нему бэк подставляет договорные тексты поставки (supply_for_contract, note, note_3, hdd, way, logins_quantity, contract_supply_prop_q, quantity_for_kp), если они не присланы в fields',
        required: false,
    })
    @IsOptional()
    @IsString()
    supplyCode?: string;
    @ApiProperty({
        description:
            'Вид договора главной строки — какие тексты поставки брать; по умолчанию service',
        enum: DEAL_SEND_CONTRACT_KINDS,
        required: false,
    })
    @IsOptional()
    @IsIn(DEAL_SEND_CONTRACT_KINDS)
    contractKind?: DealSendContractKind;
    @ApiProperty({ type: [DealSendFieldDto], description: 'Поля сделки' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DealSendFieldDto)
    fields: DealSendFieldDto[];

    @ApiProperty({
        type: [DealSendProductRowDto],
        description:
            'Товарные строки. Не переданы или пустой список — строки сделки не трогаем (как легаси: Laravel пустой список не писал, а случайный [] стёр бы товары и сумму)',
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DealSendProductRowDto)
    productRows?: DealSendProductRowDto[];

    @ApiProperty({
        description: 'Куда писать; не передан — в сделку',
        type: DealSendTargetDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DealSendTargetDto)
    target?: DealSendTargetDto;

    @ApiProperty({
        description:
            'Ключ нажатия «Сохранить» (UUID, генерирует фронт). Повтор запроса с тем же ключом не создаёт вторую сделку, а возвращает созданную',
        required: false,
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    requestKey?: string;

    @ApiProperty({
        description:
            'Метка сборки фронта (время/хэш). Только для лога: две версии фронта живут одновременно, пока у менеджера открыт старый iframe',
        required: false,
        maxLength: 200,
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    clientBuild?: string;
}

/**
 * Почему значение поля не записано:
 * - `not_on_portal` — такого поля нет в схеме портала;
 * - `ambiguous_code` — коду соответствует несколько полей сделки, а `appType`
 *   не передан (так устроен `consalting`);
 * - `inn_protected` — поле ИНН, менять его этой ручкой нельзя
 *   (см. {@link INN_PROTECTED_CODES});
 * - `unknown_item` — у списочного поля на портале нет такого пункта (ID
 *   пункта разъехался с Bitrix или пункты не заведены).
 */
export const DEAL_FIELD_SKIP_REASONS = [
    'not_on_portal',
    'ambiguous_code',
    'inn_protected',
    'unknown_item',
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

    @ApiProperty({
        description:
            'Название поля: из схемы портала, иначе из канона, иначе код',
    })
    title: string;
}

/**
 * Предупреждения ответа:
 * - `stage_not_found` — у воронки нет стадии «Документы», сделка создана на
 *   первой стадии;
 * - `replayed` — повтор запроса с тем же requestKey: вернули уже созданную
 *   сделку, вторую не создавали;
 * - `write_not_queued` — запись полей и строк поставить в очередь не
 *   удалось (operationId null): фронт пишет через легаси в эту сделку.
 */
export const DEAL_SEND_WARNINGS = [
    'stage_not_found',
    'replayed',
    'write_not_queued',
] as const;
export type DealSendWarning = (typeof DEAL_SEND_WARNINGS)[number];

/**
 * Сделка создана/найдена синхронно (фронту нужен её id), запись полей и
 * товарных строк уходит в очередь — как в легаси. Результат записи фронт
 * узнаёт опросом GET konstructor/deal-send/status/{operationId}.
 */
export class DealSendResponseDto {
    @ApiProperty({ description: 'Сделка, в которую пишем' })
    dealId: number;

    @ApiProperty({ description: 'Сделка была создана этим вызовом' })
    created: boolean;

    @ApiProperty({
        description:
            'Поля, значения которых записаны не были: not_on_portal — поля нет в схеме портала, ambiguous_code — коду соответствует несколько полей и не передан appType, inn_protected — поле ИНН, unknown_item — у списочного поля на портале нет такого пункта',
        type: [SkippedDealFieldDto],
    })
    skipped: SkippedDealFieldDto[];

    @ApiProperty({
        description:
            'Элемент смарта, в который записали (target.kind = smart); иначе null',
        type: Number,
        nullable: true,
        required: false,
    })
    smartId?: number | null;

    @ApiProperty({
        description:
            'Задание записи полей и строк; результат — GET konstructor/deal-send/status/{operationId}. null — писать было нечего или (warnings: write_not_queued) поставить не удалось',
        type: String,
        nullable: true,
        required: false,
    })
    operationId?: string | null;

    @ApiProperty({
        description:
            'Предупреждения: stage_not_found — нет стадии «Документы», сделка на первой стадии; replayed — повтор по requestKey, вернули уже созданную сделку; write_not_queued — запись не поставлена в очередь, писать через легаси',
        enum: DEAL_SEND_WARNINGS,
        isArray: true,
        required: false,
    })
    warnings?: DealSendWarning[];
}

/** Что записало задание: число полей и строк (null — строки не трогали). */
export class DealSendWriteResultDto {
    @ApiProperty({ description: 'Сколько полей записано' })
    fields: number;

    @ApiProperty({
        description:
            'Сколько товарных строк записано; null — строки не трогали',
        type: Number,
        nullable: true,
    })
    rows: number | null;

    @ApiProperty({
        description:
            'Не писали: у сделки есть более позднее сохранение — оно и запишет',
        required: false,
    })
    superseded?: boolean;
}

export const DEAL_SEND_JOB_STATES = [
    'waiting',
    'active',
    'retrying',
    'completed',
    'failed',
    'not_found',
] as const;
export type DealSendJobState = (typeof DEAL_SEND_JOB_STATES)[number];

/**
 * Статус задания записи сделки. Фронт опрашивает его ограниченное время:
 * `done && ok` — записано; `done && !ok` или таймаут — отправить запись в
 * легаси (решение владельца 11.11.2026, на переходный период).
 */
export class DealSendStatusResponseDto {
    @ApiProperty()
    operationId: string;

    @ApiProperty({
        enum: DEAL_SEND_JOB_STATES,
        description:
            'retrying — попытка упала, ждёт повтора; not_found — задания нет (устарело или не создавалось)',
    })
    state: DealSendJobState;

    @ApiProperty({ description: 'Ждать больше нечего: записано или упало' })
    done: boolean;

    @ApiProperty({ description: 'Записано' })
    ok: boolean;

    @ApiProperty({ description: 'Сколько попыток уже сделано' })
    attemptsMade: number;

    @ApiProperty({
        description: 'Почему не записано (последняя ошибка)',
        type: String,
        nullable: true,
    })
    error: string | null;

    @ApiProperty({ type: DealSendWriteResultDto, nullable: true })
    result: DealSendWriteResultDto | null;
}

export class DealSendPreflightQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;
}

export class DealSendPreflightFieldDto {
    @ApiProperty({ description: 'Код поля из канона' })
    code: string;

    @ApiProperty({
        description: 'Поле сделки на портале; null — нет в pbx-схеме',
        type: String,
        nullable: true,
    })
    bitrixId: string | null;
}

/**
 * Готов ли портал к созданию сделки через Nest: воронка sales_base, стадия
 * «Документы», ключевые поля. Только чтение — ничего не создаёт и не пишет.
 */
export class DealSendPreflightResponseDto {
    @ApiProperty()
    domain: string;

    @ApiProperty({
        description:
            'Сделку можно создать (есть схема сделок и воронка sales_base). Иначе deal-send без dealId ответит ошибкой, и фронт создаст сделку по-старому',
    })
    ready: boolean;

    @ApiProperty({
        description: 'Воронка sales_base: bitrixId категории',
        type: String,
        nullable: true,
    })
    categoryId: string | null;

    @ApiProperty({
        description: 'STAGE_ID стадии «Документы»; null — стадии нет',
        type: String,
        nullable: true,
    })
    createStageId: string | null;

    @ApiProperty({ type: [DealSendPreflightFieldDto] })
    fields: DealSendPreflightFieldDto[];

    @ApiProperty({ type: [String], description: 'Что не так, по-человечески' })
    problems: string[];
}
