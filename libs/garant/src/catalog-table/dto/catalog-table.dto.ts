import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
} from 'class-validator';
import {
    TableImportCreatedRef,
    TableImportReport,
    TableImportSkippedRow,
} from '../types/table-import-report.type';

/** Секции сида чистого каталога */
export const CATALOG_SEED_SECTIONS = [
    'supplies',
    'universalComplects',
    'servicePackages',
] as const;

export type CatalogSeedSection = (typeof CATALOG_SEED_SECTIONS)[number];

/**
 * multipart-флаги приходят строками — приводим к boolean.
 *
 * ВАЖНО: глобальный ValidationPipe включает enableImplicitConversion,
 * а оно для boolean-поля превращает в true ЛЮБУЮ непустую строку —
 * включая 'false'. Поэтому @Type(() => String) обязателен: он
 * отключает неявное приведение, и сюда попадает исходная строка.
 * Без него «Сохранить в каталог» уходило как пробный прогон и
 * ничего не записывало.
 */
const toBoolean = (): PropertyDecorator => {
    const transform = Transform(({ value }: { value: unknown }) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return ['1', 'true', 'yes', 'да'].includes(value.toLowerCase());
        }
        return false;
    });
    const asString = Type(() => String);
    return (target, key) => {
        asString(target, key);
        transform(target, key);
    };
};

export class ImportTableRequestDto {
    @ApiPropertyOptional({
        description:
            'Пробный прогон: посчитать изменения и показать отчёт, ничего не записывая в каталог.',
        example: true,
        default: false,
        type: Boolean,
    })
    @IsOptional()
    @toBoolean()
    @IsBoolean()
    dryRun?: boolean;
}

export class TableImportSkippedRowDto implements TableImportSkippedRow {
    @ApiProperty({
        description:
            'Адресация пропущенной строки: код сущности, либо «строка N», либо «код/колонка».',
        example: 'buh/internet_5',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Причина, по которой строка не применена.',
        example: 'вид поставки «internet_7» не найден в справочнике',
        type: String,
    })
    reason: string;
}

export class TableImportCreatedRefDto implements TableImportCreatedRef {
    @ApiProperty({
        description: 'Что создано: «вид поставки», «комплект» или «пакет».',
        example: 'вид поставки',
        type: String,
    })
    kind: string;

    @ApiProperty({
        description: 'Код созданной записи в каталоге.',
        example: 'internet_5',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название созданной записи.',
        example: 'Интернет 5 ОД',
        type: String,
    })
    name: string;
}

export class TableImportReportDto implements TableImportReport {
    @ApiProperty({
        description: 'Лист файла или секция, к которой относится отчёт.',
        example: 'prof-regions',
        type: String,
    })
    section: string;

    @ApiProperty({
        description:
            'Сколько записей создано (в пробном прогоне — было бы создано).',
        example: 12,
        type: Number,
    })
    created: number;

    @ApiProperty({
        description:
            'Сколько записей обновлено (в пробном прогоне — было бы обновлено).',
        example: 340,
        type: Number,
    })
    updated: number;

    @ApiProperty({
        description:
            'Сколько строк совпало с текущими данными (повторная загрузка того же файла даёт только их).',
        example: 56,
        type: Number,
    })
    unchanged: number;

    @ApiPropertyOptional({
        description:
            'Записи справочников, заведённые попутно: виды поставки, комплекты, пакеты. Считаются отдельно от цен.',
        type: [TableImportCreatedRefDto],
    })
    createdRefs?: TableImportCreatedRefDto[];

    @ApiProperty({
        description: 'Строки, которые не применены, с причинами.',
        type: [TableImportSkippedRowDto],
    })
    skipped: TableImportSkippedRowDto[];
}

export class CatalogSeedRequestDto {
    @ApiProperty({
        description:
            'Какие справочники досоздать: supplies — сетка видов поставок, universalComplects — универсальная линейка с рабсами, servicePackages — пакеты LegalTech, СТАР и консалтинга. Создаётся только отсутствующее, существующее не перетирается.',
        isArray: true,
        enum: CATALOG_SEED_SECTIONS,
        example: ['supplies', 'universalComplects', 'servicePackages'],
    })
    @IsArray()
    @ArrayUnique()
    @IsIn(CATALOG_SEED_SECTIONS, { each: true })
    sections: CatalogSeedSection[];

    @ApiPropertyOptional({
        description:
            'Пробный прогон: показать, что было бы создано, без записи.',
        example: true,
        default: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;
}
