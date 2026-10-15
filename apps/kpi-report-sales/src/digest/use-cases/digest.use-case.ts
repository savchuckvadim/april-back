import { Logger } from '@nestjs/common';
import { BitrixBaseApi } from '@lib/bitrix';
import { PBXService } from '@/modules/pbx';
import type { IsoDate } from '../../shared/lib/month-segments.util';
import { buildReportUsersKey, ReportResultCacheService } from '../../report';
import {
    buildAirtimeFilter,
    fetchAirtimeRows,
} from '../../airtime/lib/voximplant-fetch.util';
import {
    KPI_DIGEST_BATCH_CONTEXT,
    KPI_DIGEST_CACHE_APP,
    KPI_DIGEST_CACHE_GROUPS,
    KPI_DIGEST_CALL_ROWS_CAP,
    KPI_DIGEST_ELEMENTS_CAP,
    KPI_DIGEST_OPEN_DAY_TTL_SECONDS,
    KPI_DIGEST_PLAN_ACTION_CODES,
    KPI_DIGEST_RESULT_TTL_SECONDS,
} from '../constants/digest.const';
import type { KpiDigestFiltersDto } from '../dto/digest-request.dto';
import type { KpiDigestReportDto } from '../dto/digest-response.dto';
import { DigestPartitionCacheService } from '../cache/digest-partition-cache.service';
import {
    buildDigestCallsKey,
    buildDigestDayKey,
    buildDigestPlannedKey,
    buildDigestPresentationsKey,
    buildDigestResultKey,
} from '../cache/digest-cache-key.util';
import { assembleDigest } from '../lib/digest-assemble.util';
import {
    resolveDigestDealFields,
    type DigestDealFields,
} from '../lib/digest-deal-fields.util';
import { DigestPresentationsLoader } from './digest-presentations.loader';
import type { DigestPresentationsPartition } from '../types/digest-presentations.type';
import { reduceCallRows } from '../lib/digest-calls.util';
import {
    DigestListFields,
    digestSelectFields,
    resolveDigestListFields,
} from '../lib/digest-list-fields.util';
import { loadListElements } from '../lib/digest-page-loader';
import {
    assertIsoDate,
    dayBounds,
    ttlForDigestDay,
} from '../lib/digest-period.util';
import { mapListElementToRecord } from '../lib/digest-record.mapper';
import {
    reduceDayRecords,
    reducePlannedRecords,
} from '../lib/digest-reduce.util';
import type {
    DigestCallsPartition,
    DigestDayPartition,
    DigestPlannedPartition,
} from '../types/digest-partition.type';

export interface DigestGenerateOptions {
    /** Обойти чтение партиций и конверта (запись — всегда, write-through). */
    forceRefresh?: boolean;
    /** «Сейчас» для TTL закрытого/открытого дня (тесты). */
    now?: Date;
}

/**
 * Дневной дайджест ОП: три партиции дня по всему порталу (события списка
 * sales_kpi, «запланировано на начало дня», фактические звонки) →
 * редукция по сотрудникам → ответ по запрошенной выборке + сводка по всем.
 *
 * Партиции не зависят от состава сотрудников: любой фильтр отчёта
 * собирается из тех же трёх записей кэша. Звонки — fail-open (warning,
 * calls: null): недоступная телефония не должна прятать события дня.
 *
 * НЕ Injectable: `new DigestUseCase()` + init(domain, pbx, …) per-domain
 * (правило CLAUDE.md про race condition инстансов битрикса).
 */
export class DigestUseCase {
    private readonly logger = new Logger(DigestUseCase.name);
    private domain: string;
    private api: BitrixBaseApi;
    private fields: DigestListFields;
    private dealFields: DigestDealFields;
    private partitions: DigestPartitionCacheService;
    private results?: ReportResultCacheService;

    async init(
        domain: string,
        pbx: PBXService,
        partitions: DigestPartitionCacheService,
        results?: ReportResultCacheService,
    ): Promise<void> {
        const { portal, PortalModel, bitrix } = await pbx.init(domain);
        if (!portal) throw new Error('Portal not found');
        this.domain = domain;
        this.api = bitrix.api;
        this.partitions = partitions;
        this.results = results;
        this.fields = resolveDigestListFields(PortalModel);
        this.dealFields = resolveDigestDealFields(PortalModel);
    }

    async generate(
        filters: KpiDigestFiltersDto,
        options: DigestGenerateOptions = {},
    ): Promise<KpiDigestReportDto> {
        const date = assertIsoDate(filters.date);
        const now = options.now ?? new Date();
        const force = options.forceRefresh === true;
        const warnings: string[] = [];

        const day = await this.partition<DigestDayPartition>(
            buildDigestDayKey(date),
            KPI_DIGEST_CACHE_GROUPS.DAY,
            date,
            now,
            force,
            () => this.buildDayPartition(date),
        );
        const planned = await this.partition<DigestPlannedPartition>(
            buildDigestPlannedKey(date),
            KPI_DIGEST_CACHE_GROUPS.PLANNED,
            date,
            now,
            force,
            () => this.buildPlannedPartition(date, warnings),
        );
        const calls = await this.loadCallsPartition(date, now, force, warnings);
        const presentations = await this.loadPresentationsPartition(date, now, force, warnings);

        const report = assembleDigest({
            date,
            departament: filters.departament,
            day,
            planned,
            calls,
            presentations,
            catalog: this.fields.catalog,
            listId: this.fields.listId,
            warnings,
            generatedAt: new Date().toISOString(),
        });
        await this.writeResult(date, filters, report);
        return report;
    }

    /** Партиция из кэша либо сборка + write-through (truncated — короткий TTL). */
    private async partition<T extends { truncated: boolean }>(
        key: string,
        group: string,
        date: IsoDate,
        now: Date,
        force: boolean,
        build: () => Promise<T>,
    ): Promise<T> {
        if (!force) {
            const cached = await this.partitions.get<T>(this.domain, key);
            if (cached) return cached;
        }
        const built = await build();
        await this.partitions.set(
            this.domain,
            key,
            built,
            built.truncated
                ? KPI_DIGEST_OPEN_DAY_TTL_SECONDS
                : ttlForDigestDay(date, now),
            group,
        );
        return built;
    }

    /** События дня: все элементы списка с event_date внутри дня, весь портал. */
    private async buildDayPartition(date: IsoDate): Promise<DigestDayPartition> {
        const { eventDate } = this.fields;
        const bounds = dayBounds(date);
        const { rows, total, truncated } = await loadListElements(this.api, {
            listId: this.fields.listId,
            filter: {
                [`>${eventDate.filterKey}`]: bounds.bitrixFrom,
                [`<${eventDate.filterKey}`]: bounds.bitrixTo,
            },
            select: digestSelectFields(this.fields),
            cap: KPI_DIGEST_ELEMENTS_CAP,
            context: `${KPI_DIGEST_BATCH_CONTEXT}: события ${date}`,
        });
        this.warnIfTruncated('события', date, total, truncated);
        const records = rows.map(row => mapListElementToRecord(row, this.fields));
        return reduceDayRecords(date, records, {
            elements: total,
            truncated,
            builtAt: new Date().toISOString(),
        });
    }

    /**
     * «Запланировано на начало дня»: план/перенос с дедлайном в этот день,
     * созданные ДО его начала. Нет поля plan_date или item'ов plan/pound —
     * партиция пустая с предупреждением (не ошибка: событий дня это не
     * касается).
     */
    private async buildPlannedPartition(
        date: IsoDate,
        warnings: string[],
    ): Promise<DigestPlannedPartition> {
        const { eventAction, eventDate, planDate } = this.fields;
        const builtAt = new Date().toISOString();
        const empty = (): DigestPlannedPartition => ({
            date,
            byUser: {},
            elements: 0,
            truncated: false,
            builtAt,
        });

        if (!planDate) {
            warnings.push(
                'В списке sales_kpi нет поля «дата плана» — «запланировано на начало дня» недоступно.',
            );
            return empty();
        }
        const actionIds = KPI_DIGEST_PLAN_ACTION_CODES.map(
            code => this.fields.actionItemsByCode.get(code)?.bitrixId,
        ).filter((id): id is string => !!id);
        if (!actionIds.length) {
            warnings.push(
                'На портале нет действий plan/pound — «запланировано на начало дня» недоступно.',
            );
            return empty();
        }

        const bounds = dayBounds(date);
        const { rows, total, truncated } = await loadListElements(this.api, {
            listId: this.fields.listId,
            filter: {
                [eventAction.filterKey]: actionIds,
                [`>=${planDate.filterKey}`]: bounds.bitrixFrom,
                [`<${planDate.filterKey}`]: bounds.bitrixTo,
                [`<${eventDate.filterKey}`]: bounds.bitrixFrom,
            },
            select: digestSelectFields(this.fields),
            cap: KPI_DIGEST_ELEMENTS_CAP,
            context: `${KPI_DIGEST_BATCH_CONTEXT}: план на ${date}`,
        });
        this.warnIfTruncated('план', date, total, truncated);
        const records = rows.map(row => mapListElementToRecord(row, this.fields));
        return reducePlannedRecords(date, records, {
            elements: total,
            truncated,
            builtAt,
        });
    }

    /** Звонки дня по всему порталу; недоступность телефонии — warning, не ошибка. */
    private async loadCallsPartition(
        date: IsoDate,
        now: Date,
        force: boolean,
        warnings: string[],
    ): Promise<DigestCallsPartition | null> {
        try {
            return await this.partition<DigestCallsPartition>(
                buildDigestCallsKey(date),
                KPI_DIGEST_CACHE_GROUPS.CALLS,
                date,
                now,
                force,
                async () => {
                    const bounds = dayBounds(date);
                    const { rows, truncated } = await fetchAirtimeRows(
                        this.api,
                        buildAirtimeFilter(undefined, date, bounds.nextDate),
                        KPI_DIGEST_CALL_ROWS_CAP,
                        this.logger,
                    );
                    this.warnIfTruncated('звонки', date, rows.length, truncated);
                    return reduceCallRows(date, rows, {
                        truncated,
                        builtAt: new Date().toISOString(),
                    });
                },
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`[${this.domain}] звонки за ${date} недоступны: ${message}`);
            warnings.push(`Фактические звонки за ${date} недоступны: ${message}`);
            return null;
        }
    }

    /**
     * Презентации и продажи дня (сделки) — fail-open: недоступные сделки не
     * должны прятать события дня (warning + presentations: null).
     */
    private async loadPresentationsPartition(
        date: IsoDate,
        now: Date,
        force: boolean,
        warnings: string[],
    ): Promise<DigestPresentationsPartition | null> {
        try {
            return await this.partition<DigestPresentationsPartition>(
                buildDigestPresentationsKey(date),
                KPI_DIGEST_CACHE_GROUPS.PRESENTATIONS,
                date,
                now,
                force,
                () => new DigestPresentationsLoader(this.api, this.dealFields).load(date),
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`[${this.domain}] презентации за ${date} недоступны: ${message}`);
            warnings.push(`Презентации и продажи за ${date} недоступны: ${message}`);
            return null;
        }
    }

    private warnIfTruncated(
        what: string,
        date: IsoDate,
        total: number,
        truncated: boolean,
    ): void {
        if (!truncated) return;
        this.logger.error(
            `[${this.domain}] ${what} за ${date}: ${total} строк — выгрузка ` +
                'обрезана по лимиту, партиция помечена truncated',
        );
    }

    /** Write-through конверта результата по выборке (воркер, снапшот). */
    private async writeResult(
        date: IsoDate,
        filters: KpiDigestFiltersDto,
        report: KpiDigestReportDto,
    ): Promise<void> {
        if (!this.results) return;
        const usersKey = buildReportUsersKey(
            filters.departament.map(user => user.ID),
        );
        await this.results.setReady(
            KPI_DIGEST_CACHE_APP,
            this.domain,
            buildDigestResultKey(date, usersKey),
            report,
            KPI_DIGEST_RESULT_TTL_SECONDS,
        );
    }
}
