import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ComplectCompositionDto } from './complect-composition.dto';

/**
 * Слепок сделки конструктора (строка bx_document_deals).
 * Формат v1: каждое payload-поле — JSON-строка (см. front apps/konstructor/docs/legacy-persistence.md §2).
 * Таблицу пишет и Laravel garant-app.ru (DealController::addDeal) — колонки совпадают.
 */
export class InnerDealSnapshotDto {
    @ApiProperty({ type: Number })
    id: number;

    @ApiProperty({ type: Number, nullable: true })
    dealId: number | null;

    @ApiProperty({ type: Number, nullable: true })
    userId: number | null;

    @ApiProperty({ type: String, nullable: true })
    domain: string | null;

    @ApiProperty({ type: Number, nullable: true })
    serviceSmartId: number | null;

    @ApiProperty({
        type: Number,
        nullable: true,
        description:
            'Элемент смарта «Варианты комплекта» (колонка smartId). Заполнен — это один из вариантов предложения на сделке',
    })
    variantSmartId: number | null;

    @ApiProperty({ type: Number, nullable: true })
    templateId: number | null;

    @ApiProperty({ type: Number, nullable: true })
    favoriteId: number | null;

    @ApiProperty({ type: Boolean, nullable: true })
    isFavorite: boolean | null;

    @ApiProperty({ type: String, nullable: true })
    dealName: string | null;

    @ApiProperty({ type: String, nullable: true })
    app: string | null;

    @ApiProperty({ type: String, nullable: true })
    global: string | null;

    @ApiProperty({ type: String, nullable: true })
    currentComplect: string | null;

    @ApiProperty({ type: String, nullable: true })
    od: string | null;

    @ApiProperty({ type: String, nullable: true })
    result: string | null;

    @ApiProperty({ type: String, nullable: true })
    contract: string | null;

    @ApiProperty({ type: String, nullable: true })
    product: string | null;

    @ApiProperty({ type: String, nullable: true })
    rows: string | null;

    @ApiProperty({ type: String, nullable: true })
    regions: string | null;

    @ApiProperty({ type: String, nullable: true })
    iskraConfig: string | null;

    @ApiProperty({ type: String, nullable: true })
    ltOther: string | null;

    @ApiProperty({
        type: ComplectCompositionDto,
        nullable: true,
        description:
            'Настройки сборки комплекта: режим, участники, настройки КП. null — сделка ведёт себя как раньше (один набор, одно КП)',
    })
    settings: ComplectCompositionDto | null;
}

export class InnerDealFindQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 129487 })
    @IsInt()
    @Type(() => Number)
    dealId: number;

    @ApiProperty({ type: Number, required: false })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    serviceSmartId?: number;
}

export class InnerDealListQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 129487 })
    @IsInt()
    @Type(() => Number)
    dealId: number;
}

/**
 * «Слепка нет» — нормальный случай для большинства сделок,
 * поэтому не 404 (глобальный exception-фильтр алертит в Telegram), а found:false.
 */
export class InnerDealFindResponseDto {
    @ApiProperty({ type: Boolean })
    found: boolean;

    @ApiProperty({ type: InnerDealSnapshotDto, nullable: true })
    deal: InnerDealSnapshotDto | null;
}

export class InnerDealUpsertDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 129487 })
    @IsInt()
    @Type(() => Number)
    dealId: number;

    @ApiProperty({ type: Number, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    userId?: number | null;

    @ApiProperty({ type: Number, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    serviceSmartId?: number | null;

    @ApiProperty({
        type: Number,
        required: false,
        nullable: true,
        description:
            'Элемент смарта «Варианты комплекта»: с ним слепок становится одним из вариантов предложения на сделке',
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    variantSmartId?: number | null;

    @ApiProperty({ type: Number, required: false, nullable: true })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    templateId?: number | null;

    @ApiProperty({ type: Boolean, required: false, nullable: true })
    @IsOptional()
    @IsBoolean()
    isFavorite?: boolean | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    dealName?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    app?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    global?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    currentComplect?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    od?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    result?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    contract?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    product?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    rows?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    regions?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    iskraConfig?: string | null;

    @ApiProperty({ type: String, required: false, nullable: true })
    @IsOptional()
    @IsString()
    ltOther?: string | null;

    @ApiProperty({
        type: ComplectCompositionDto,
        required: false,
        nullable: true,
        description:
            'Настройки сборки комплекта. Хранятся у строки самой сделки; передавать вместе со слепком сделки, а не варианта',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ComplectCompositionDto)
    settings?: ComplectCompositionDto | null;
}

/**
 * Сохранение только настроек сборки комплекта.
 *
 * Отдельная ручка, а не `POST /konstructor/deal` с одними настройками: upsert
 * слепка пишет ВСЕ колонки, и частичный запрос обнулил бы состояние
 * конструктора. Настройки меняются отдельно от слепка и гораздо реже.
 */
export class InnerDealSettingsDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 129487 })
    @IsInt()
    @Type(() => Number)
    dealId: number;

    @ApiProperty({
        type: ComplectCompositionDto,
        nullable: true,
        description: 'null — вернуть сделку к поведению «один набор, одно КП»',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ComplectCompositionDto)
    settings: ComplectCompositionDto | null;
}

/** Почему копирование слепка не состоялось. */
export const INNER_DEAL_COPY_SKIP_REASONS = [
    'source_not_found',
    'target_exists',
] as const;

export type InnerDealCopySkipReason =
    (typeof INNER_DEAL_COPY_SKIP_REASONS)[number];

/**
 * Копирование слепка из одной сделки в другую — ручное восстановление, когда
 * робот перезаключения не смог перенести состояние конструктора в новую сделку.
 */
export class InnerDealCopyDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({
        type: Number,
        example: 159701,
        description: 'Сделка-источник, из которой берём слепок',
    })
    @IsInt()
    @Type(() => Number)
    sourceDealId: number;

    @ApiProperty({
        type: Number,
        example: 182895,
        description: 'Сделка-получатель, в которую кладём копию',
    })
    @IsInt()
    @Type(() => Number)
    targetDealId: number;

    @ApiProperty({
        type: Number,
        required: false,
        nullable: true,
        description:
            'Взять у источника слепок конкретного сервисного смарта, а не обычный слепок сделки',
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    sourceServiceSmartId?: number | null;

    @ApiProperty({
        type: Boolean,
        required: false,
        default: false,
        description:
            'Перезаписать слепок сделки-получателя, если он уже есть. Без флага такой вызов отклоняется, чтобы не затереть работу менеджера',
    })
    @IsOptional()
    @IsBoolean()
    force?: boolean;
}

/**
 * «Не скопировали» — штатный исход (нет источника, занята цель), поэтому не
 * исключение: глобальный фильтр на каждую ошибку шлёт алерт в Telegram.
 */
export class InnerDealCopyResponseDto {
    @ApiProperty({ type: Boolean })
    copied: boolean;

    @ApiProperty({
        enum: INNER_DEAL_COPY_SKIP_REASONS,
        required: false,
        nullable: true,
        description: 'Заполнено, когда copied:false',
    })
    reason: InnerDealCopySkipReason | null;

    @ApiProperty({ type: InnerDealSnapshotDto, nullable: true })
    deal: InnerDealSnapshotDto | null;
}

/** Запрос списка вариантов комплекта сделки. */
export class InnerDealVariantListQueryDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({ type: Number, example: 129487 })
    @IsInt()
    @Type(() => Number)
    dealId: number;
}

/** Запрос слепка конкретного варианта. */
export class InnerDealVariantFindQueryDto extends InnerDealVariantListQueryDto {
    @ApiProperty({
        type: Number,
        description: 'Элемент смарта «Варианты комплекта»',
    })
    @IsInt()
    @Type(() => Number)
    variantSmartId: number;
}
