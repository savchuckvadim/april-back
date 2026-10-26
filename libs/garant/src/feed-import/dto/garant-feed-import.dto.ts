import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
} from 'class-validator';
import {
    FeedImportSection,
    FeedSeedSection,
} from '../services/garant-feed-import.service';
import {
    ImportSectionReport,
    ImportSkippedRow,
} from '../types/garant-feed.types';

/** Runtime-константы секций — единственный источник для валидации и Swagger */
export const FEED_IMPORT_SECTIONS = [
    'regions',
    'profPrices',
    'servicePrices',
] as const satisfies readonly FeedImportSection[];

export const FEED_SEED_SECTIONS = [
    'supplies',
    'universalComplects',
    'servicePackages',
] as const satisfies readonly FeedSeedSection[];

export class GarantFeedImportRequestDto {
    @ApiPropertyOptional({
        description:
            'Какие данные импортировать из фида: regions — рабсы регионов, profPrices — цены prof-линейки, servicePrices — цены LT/СТАР. Пустой список — только сиды.',
        isArray: true,
        enum: FEED_IMPORT_SECTIONS,
        example: ['regions', 'profPrices', 'servicePrices'],
    })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsIn(FEED_IMPORT_SECTIONS, { each: true })
    sections?: FeedImportSection[];

    @ApiPropertyOptional({
        description:
            'Какие справочники досоздать перед импортом (создаются только отсутствующие записи): supplies — сетка поставок, universalComplects — универсальная линейка с рабсами из фида, servicePackages — пакеты LT/СТАР/консалтинг.',
        isArray: true,
        enum: FEED_SEED_SECTIONS,
        example: ['supplies', 'servicePackages'],
    })
    @IsOptional()
    @IsArray()
    @ArrayUnique()
    @IsIn(FEED_SEED_SECTIONS, { each: true })
    seed?: FeedSeedSection[];

    @ApiPropertyOptional({
        description:
            'Пробный прогон: посчитать created/updated/skipped без записи в БД.',
        example: true,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;
}

export class FeedImportSkippedRowDto implements ImportSkippedRow {
    @ApiProperty({
        description: 'Ключ пропущенной строки фида (адресация для поиска).',
        example: 'complect#3/supply#9/region#0',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Причина пропуска строки.',
        example: 'комплект expert не найден в БД',
        type: String,
    })
    reason: string;
}

export class FeedImportSectionReportDto implements ImportSectionReport {
    @ApiProperty({
        description: 'Название секции импорта.',
        example: 'profPrices',
        type: String,
    })
    section: string;

    @ApiProperty({
        description: 'Сколько записей создано (в dryRun — было бы создано).',
        example: 120,
        type: Number,
    })
    created: number;

    @ApiProperty({
        description:
            'Сколько записей обновлено (в dryRun — было бы обновлено).',
        example: 288,
        type: Number,
    })
    updated: number;

    @ApiProperty({
        description: 'Пропущенные строки с причинами.',
        type: [FeedImportSkippedRowDto],
    })
    skipped: FeedImportSkippedRowDto[];
}

export class GarantFeedImportResponseDto {
    @ApiProperty({
        description: 'Импорт выполнялся в пробном режиме (без записи).',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Задан ли адрес фида (env GARANT_FEED_URL).',
        example: true,
        type: Boolean,
    })
    feedUrlConfigured: boolean;

    @ApiProperty({
        description: 'Отчёты по секциям в порядке выполнения.',
        type: [FeedImportSectionReportDto],
    })
    reports: FeedImportSectionReportDto[];
}
