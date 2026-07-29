import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';

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
}
