import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import { ReportGetFiltersDto } from '../../report/dto/kpi-report-request.dto';
import { GetCallingStatisticFiltersDto } from '../../report/dto/calling-statistic.dto';
import { ReportData } from '../../shared/dto/kpi.dto';

/** Максимальный срок жизни любой ссылки, дней. */
export const SHARE_LINK_MAX_LIFETIME_DAYS = 14;

/** Максимальный период фильтра обновляемой ссылки, дней. */
export const SHARE_LINK_MAX_REFRESHABLE_RANGE_DAYS = 31;

/** Лимит активных ссылок на одного создателя (анти-абуз). */
export const SHARE_LINK_MAX_ACTIVE_PER_CREATOR = 20;

export enum EShareLinkStatus {
    /** Снимок готовится фоновой джобой (сразу после создания). */
    PENDING = 'pending',
    ACTIVE = 'active',
    REVOKED = 'revoked',
    ERROR = 'error',
}

/**
 * Снимок фильтра ссылки — всё, что нужно бэку, чтобы регенерировать данные
 * (реплей тех же запросов, что фронт шлёт в get/calling-statistic),
 * и фронту, чтобы отрисовать read-only страницу в том же виде.
 * Хранится в share_link.filter_snapshot (LONGTEXT, JSON).
 */
/**
 * Фильтры финансовой аналитики (вкладка «Финансы»): закрытые продажи
 * за период + горячие клиенты. Не переданы — финансов в снимке нет.
 */
export class ShareLinkFinanceFiltersDto {
    @ApiProperty({ description: 'ID сотрудников (assignedIds)', type: [Number] })
    @IsArray()
    assignedIds: number[];

    @ApiProperty({ description: 'Период yyyy-MM-dd (как state.report.date)' })
    @IsString()
    dateFrom: string;

    @ApiProperty()
    @IsString()
    dateTo: string;
}

export class ShareLinkFilterSnapshotDto {
    @ApiProperty({ description: 'Версия формата снимка', default: 1 })
    @IsInt()
    version: number;

    @ApiProperty({
        description: 'Фильтры POST /kpi-report/get (реплеятся при обновлении)',
        type: ReportGetFiltersDto,
    })
    @ValidateNested()
    @Type(() => ReportGetFiltersDto)
    reportFilters: ReportGetFiltersDto;

    @ApiProperty({
        description: 'Фильтры POST /kpi-report/calling-statistic',
        type: GetCallingStatisticFiltersDto,
    })
    @ValidateNested()
    @Type(() => GetCallingStatisticFiltersDto)
    callingFilters: GetCallingStatisticFiltersDto;

    @ApiProperty({
        description:
            'Фильтры финансовой аналитики; не переданы — финансов в снимке нет',
        type: ShareLinkFinanceFiltersDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ShareLinkFinanceFiltersDto)
    financeFilters?: ShareLinkFinanceFiltersDto;

    @ApiProperty({
        description:
            'Фильтры эфирного времени (сотрудники + raw-даты отчёта); ' +
            'не переданы — эфирного времени в снимке нет',
        type: GetCallingStatisticFiltersDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => GetCallingStatisticFiltersDto)
    airtimeFilters?: GetCallingStatisticFiltersDto;

    @ApiProperty({
        description:
            'UI-конфиг фронта как есть (reportType, merged-selection, ' +
            'вкладка конверсий, структура отделов) — бэк не интерпретирует',
        type: 'object',
        additionalProperties: true,
    })
    @IsObject()
    ui: Record<string, unknown>;
}

export class CreateShareLinkDto {
    @ApiProperty({ description: 'Домен портала Bitrix24' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({ description: 'ID пользователя Bitrix — автор ссылки' })
    @Type(() => Number)
    @IsInt()
    creatorBxUserId: number;

    @ApiProperty({ description: 'Имя автора (для строки «от такого-то»)' })
    @IsString()
    @IsNotEmpty()
    creatorName: string;

    @ApiPropertyOptional({
        description: 'Название; не указано — соберём «от {автор}: {период}»',
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({
        description: `Срок жизни в днях (1..${SHARE_LINK_MAX_LIFETIME_DAYS})`,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(SHARE_LINK_MAX_LIFETIME_DAYS)
    expiresInDays: number;

    @ApiProperty({
        description:
            'Обновляемая: пересчёт каждые 15 мин; период фильтра ≤ 1 месяца',
    })
    @IsBoolean()
    isRefreshable: boolean;

    @ApiProperty({ type: ShareLinkFilterSnapshotDto })
    @ValidateNested()
    @Type(() => ShareLinkFilterSnapshotDto)
    snapshot: ShareLinkFilterSnapshotDto;
}

/** Метаданные ссылки для интерфейса владельца. */
export class ShareLinkDto {
    @ApiProperty()
    id: string;

    @ApiProperty({
        description: 'Ключ ссылки — хвост публичного URL /share/{token}',
    })
    token: string;

    @ApiProperty()
    domain: string;

    @ApiProperty()
    creatorBxUserId: number;

    @ApiProperty()
    creatorName: string;

    @ApiProperty()
    title: string;

    @ApiProperty({
        description: 'Период фильтра — от',
        type: String,
        nullable: true,
    })
    periodFrom: string | null;

    @ApiProperty({
        description: 'Период фильтра — до',
        type: String,
        nullable: true,
    })
    periodTo: string | null;

    @ApiProperty()
    isRefreshable: boolean;

    @ApiProperty()
    refreshIntervalSec: number;

    @ApiProperty({ type: String, nullable: true })
    lastRefreshedAt: string | null;

    @ApiProperty({ type: String, nullable: true })
    nextRefreshAt: string | null;

    @ApiProperty()
    expiresAt: string;

    @ApiProperty({ enum: EShareLinkStatus })
    status: EShareLinkStatus;

    @ApiProperty({ description: 'Ссылка протухла по сроку' })
    isExpired: boolean;

    @ApiProperty()
    viewCount: number;

    @ApiProperty({ type: String, nullable: true })
    lastViewedAt: string | null;

    @ApiProperty({ type: String, nullable: true })
    createdAt: string | null;
}

export class ShareLinkListRequestDto {
    @ApiProperty({ description: 'Домен портала' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({ description: 'Только ссылки этого автора' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    creatorBxUserId?: number;

    @ApiPropertyOptional({
        description: 'Включая отозванные/протухшие',
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    includeInactive?: boolean;
}

export class ShareLinkTokenRequestDto {
    @ApiProperty({ description: 'Домен портала (проверка принадлежности)' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    token: string;
}

/**
 * Сброс снимков ссылок из кэша (метаданные ссылок не трогаются):
 * token указан — один снимок, иначе все снимки портала. Следующий
 * просмотр публичной страницы синхронно перегенерирует данные.
 */
export class ShareLinkCacheResetRequestDto {
    @ApiProperty({ description: 'Домен портала' })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({ description: 'Токен конкретной ссылки; не указан — все снимки портала' })
    @IsOptional()
    @IsString()
    token?: string;
}

export class ShareLinkCacheResetResponseDto {
    @ApiProperty({ description: 'Удалено строк в БД (app_cache)' })
    deletedDb: number;

    @ApiProperty({ description: 'Удалено ключей в Redis' })
    deletedRedis: number;
}

export class UpdateShareLinkDto extends ShareLinkTokenRequestDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({
        description:
            'Переключить обновляемость (включение валидирует период ≤ 1 мес)',
    })
    @IsOptional()
    @IsBoolean()
    isRefreshable?: boolean;
}

export class ShareLinkListResponseDto {
    @ApiProperty({ type: [ShareLinkDto] })
    links: ShareLinkDto[];
}

// ─────────────────────────── публичная сторона ───────────────────────────

export class ShareLinkPublicMetaDto {
    @ApiProperty({
        description:
            'ready — снимок готов; generating — ещё строится (данные пустые, ' +
            'страница показывает «готовится» и подтягивает)',
        enum: ['ready', 'generating'],
    })
    status: 'ready' | 'generating';

    @ApiProperty()
    title: string;

    @ApiProperty()
    creatorName: string;

    @ApiProperty({ type: String, nullable: true })
    periodFrom: string | null;

    @ApiProperty({ type: String, nullable: true })
    periodTo: string | null;

    @ApiProperty()
    isRefreshable: boolean;

    @ApiProperty()
    refreshIntervalSec: number;

    @ApiProperty({ type: String, nullable: true })
    lastRefreshedAt: string | null;

    @ApiProperty()
    expiresAt: string;

    @ApiProperty({ description: 'Когда сгенерирован текущий снимок данных' })
    generatedAt: string;
}

/**
 * Ответ публичной ручки: метаданные + данные снимка. Фронт сидит этим
 * свои Redux-слайсы и рендерит обычные виджеты отчёта в read-only.
 */
export class ShareLinkPublicResponseDto {
    @ApiProperty({ type: ShareLinkPublicMetaDto })
    meta: ShareLinkPublicMetaDto;

    @ApiProperty({
        description: 'KPI-отчёт (как POST /kpi-report/get)',
        type: [ReportData],
    })
    report: ReportData[];

    @ApiProperty({
        description:
            'Статистика звонков (как POST /kpi-report/calling-statistic)',
        type: 'array',
        items: { type: 'object', additionalProperties: true },
    })
    callings: unknown[];

    @ApiProperty({
        description:
            'Финансовая аналитика: { closed: ClosedSalesReportDto, ' +
            'hotByThreshold: { presentation, document } }; null — не собиралась',
        type: 'object',
        additionalProperties: true,
        nullable: true,
    })
    finance: Record<string, unknown> | null;

    @ApiProperty({
        description:
            'Эфирное время команды (AirtimeStatisticResponseDto); null — не собиралось',
        type: 'object',
        additionalProperties: true,
        nullable: true,
    })
    airtime: Record<string, unknown> | null;

    @ApiProperty({
        description: 'UI-конфиг фронта из снимка (как сохранил создатель)',
        type: 'object',
        additionalProperties: true,
    })
    ui: Record<string, unknown>;
}
