import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsOptional,
} from 'class-validator';

/**
 * Таблицы, которые чинит ручка. Список закрытый и заведомо портальный:
 * именно их пишет установщик pbx, и именно их читает python-сервис.
 * Ничего за пределами этого перечня ручка не трогает.
 */
export enum TimestampsBackfillTableEnum {
    BTX_STAGES = 'btx_stages',
    BTX_CATEGORIES = 'btx_categories',
    BTX_RPAS = 'btx_rpas',
    BTX_DEALS = 'btx_deals',
    BTX_COMPANIES = 'btx_companies',
    BTX_CONTACTS = 'btx_contacts',
    BTX_LEADS = 'btx_leads',
    BITRIXFIELDS = 'bitrixfields',
    BITRIXFIELD_ITEMS = 'bitrixfield_items',
    SMARTS = 'smarts',
    BX_RQS = 'bx_rqs',
}

/** Тело запроса на починку пустых `created_at` / `updated_at`. */
export class TimestampsBackfillDto {
    @ApiPropertyOptional({
        description:
            'Только посчитать строки с пустыми таймстампами, ничего не записывая. ' +
            'По умолчанию true — «сухой» запуск, чтобы случайный вызов не менял БД. ' +
            'Чтобы починить, нужно явно передать false.',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'Ограничить починку перечисленными таблицами. Пусто — все таблицы из списка.',
        enum: TimestampsBackfillTableEnum,
        isArray: true,
        example: [TimestampsBackfillTableEnum.BTX_STAGES],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsEnum(TimestampsBackfillTableEnum, { each: true })
    tables?: TimestampsBackfillTableEnum[];
}

/** Результат по одной таблице. */
export class TimestampsBackfillTableResultDto {
    @ApiProperty({
        description: 'Имя таблицы',
        enum: TimestampsBackfillTableEnum,
        example: TimestampsBackfillTableEnum.BTX_STAGES,
    })
    table!: TimestampsBackfillTableEnum;

    @ApiProperty({
        description: 'Сколько строк имеют пустой created_at или updated_at',
        example: 34,
    })
    broken!: number;

    @ApiProperty({
        description:
            'Сколько строк реально починено. При dryRun всегда 0 — запись не выполнялась.',
        example: 34,
    })
    repaired!: number;
}

/** Ответ ручки починки таймстампов. */
export class TimestampsBackfillResponseDto {
    @ApiProperty({
        description: 'Был ли запуск «сухим» (без записи в БД)',
        example: true,
    })
    dryRun!: boolean;

    @ApiProperty({
        description: 'Сколько таблиц просмотрено',
        example: 11,
    })
    scannedTables!: number;

    @ApiProperty({
        description: 'Суммарно битых строк',
        example: 412,
    })
    totalBroken!: number;

    @ApiProperty({
        description: 'Суммарно починено строк (при dryRun — 0)',
        example: 0,
    })
    totalRepaired!: number;

    @ApiProperty({
        description:
            'Разбивка по таблицам. Таблицы без битых строк в ответ не попадают.',
        type: [TimestampsBackfillTableResultDto],
    })
    tables!: TimestampsBackfillTableResultDto[];
}
