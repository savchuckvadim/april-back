import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    previousWorkday,
    toPortalDate,
    trimEvidencePack,
    type AiBriefFact,
    type AiEvidencePack,
} from '@lib/sales-ai-analytics';
import { buildReportUsersKey } from '../../report';
import { AirtimeCacheService } from '../../airtime/cache/airtime-cache.service';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { buildOverviewKey, buildPulseKey } from '../cache/cache-key.util';
import {
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_PACK_ORDER,
    AI_BRIEF_SNAPSHOT_LIMIT,
    type AiBriefFactCode,
} from '../constants/ai-brief.const';
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import type {
    ManagerMonthPayload,
    ManagerWeekPayload,
} from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { isoWeekKey } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import type {
    AiOverviewCacheEntry,
    AiOverviewDto,
} from '../dto/ai-overview.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    airtimeFact,
    alertsFact,
    attentionFact,
    callsFact,
    dataQualityFact,
    disciplineFact,
    forecastFact,
    funnelGapFact,
    pipelineFact,
    planVsFactSalesFact,
} from './evidence-pack.facts';
import {
    isForecastPayload,
    isModelPayload,
    isMonthPayload,
    isWeekPayload,
    toBriefRows,
} from './evidence-pack.parse';
import type { BriefManagerRow, BriefPackSources } from './evidence-pack.types';

/** Что описывает пакет: домен, период и периметр менеджеров. */
export interface BriefPackInput {
    domain: string;
    /** Начало периода 'YYYY-MM-DD' в TZ портала. */
    from: string;
    /** Конец периода 'YYYY-MM-DD' в TZ портала. */
    to: string;
    /** Менеджеры периметра; пусто — весь ростер (кэш обзора тогда не читается). */
    managerIds: number[];
    /** «Сейчас» (тесты и крон); по умолчанию — текущее время. */
    now?: Date;
}

/** Сборщики фактов по кодам таблицы состава пакета. */
const FACT_BUILDERS: Record<
    AiBriefFactCode,
    (sources: BriefPackSources, managerIds: string[]) => AiBriefFact | null
> = {
    [AI_BRIEF_FACT_CODES.alerts]: alertsFact,
    [AI_BRIEF_FACT_CODES.attention]: attentionFact,
    [AI_BRIEF_FACT_CODES.funnelGap]: funnelGapFact,
    [AI_BRIEF_FACT_CODES.planVsFactSales]: planVsFactSalesFact,
    [AI_BRIEF_FACT_CODES.pipelineFromStage]: pipelineFact,
    [AI_BRIEF_FACT_CODES.disciplineNextStep]: disciplineFact,
    [AI_BRIEF_FACT_CODES.callsOverThreshold]: callsFact,
    [AI_BRIEF_FACT_CODES.airtime]: airtimeFact,
    [AI_BRIEF_FACT_CODES.forecastP50]: forecastFact,
    [AI_BRIEF_FACT_CODES.dataQuality]: dataQualityFact,
};

/**
 * Сборка пакета фактов AI-резюме (план Фазы 2, таблица состава потока 18).
 *
 * Источники — ТОЛЬКО кэш витрины и снапшоты ночного конвейера: в Bitrix
 * и в транскрипции сборщик не ходит, тяжёлых загрузчиков не зовёт. При
 * промахе кэша факт берётся из снапшота, при промахе обоих — пропускается.
 * Итог обрезается `trimEvidencePack` до 10 фактов и 4 КБ.
 *
 * Недельные снапшоты читаются только при промахе кэша пульса — они
 * запасной источник фактов `alerts` и `discipline_next_step`.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class EvidencePackBuilder {
    private readonly logger = new Logger(EvidencePackBuilder.name);

    constructor(
        private readonly cache: AiAnalyticsCacheService,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly settings: SettingsLoader,
        private readonly appCache: AppCacheService,
    ) {}

    async build(input: BriefPackInput): Promise<AiEvidencePack> {
        const sources = await this.loadSources(input);
        const managerIds = input.managerIds.map(String);
        const facts: AiBriefFact[] = [];
        for (const code of AI_BRIEF_PACK_ORDER) {
            const fact = FACT_BUILDERS[code](sources, managerIds);
            if (fact !== null) facts.push(fact);
        }
        const pack = trimEvidencePack(facts);
        this.logger.debug(
            `Пакет резюме ${input.domain} ${input.from}–${input.to}: ` +
                `${pack.facts.length} фактов, hash ${pack.hash}`,
        );

        return pack;
    }

    /** Кэш витрины и снапшоты конвейера за период пакета. */
    private async loadSources(
        input: BriefPackInput,
    ): Promise<BriefPackSources> {
        const { domain, to, managerIds } = input;
        const monthKey = to.slice(0, 7);
        const ids = managerIds.map(String);
        const [pulse, overview, airtime, model, months, forecasts] =
            await Promise.all([
                this.readPulse(domain, input.now ?? new Date()),
                this.readOverview(input),
                this.readAirtime(domain, monthKey, managerIds),
                this.readModel(domain, monthKey),
                this.readMonths(domain, monthKey, ids),
                this.readForecasts(domain, to, ids),
            ]);
        const weeks = pulse ? [] : await this.readWeeks(domain, to, ids);

        return { pulse, overview, airtime, model, months, forecasts, weeks };
    }

    /** Кэш пульса за последний рабочий день портала (ключ ручки pulse). */
    private async readPulse(
        domain: string,
        now: Date,
    ): Promise<AiPulseDto | null> {
        const { calendar } = await this.settings.load(domain);
        const endDate = previousWorkday(
            toPortalDate(now, calendar.timeZone),
            calendar,
        );

        return this.cache.getJson<AiPulseDto>(buildPulseKey(domain, endDate));
    }

    /**
     * Кэш обзора периода. Ключ несёт нормализованный ростер, поэтому без
     * явного списка менеджеров (весь портал) он не воспроизводится —
     * тогда факты обзора приходят из снапшотов.
     */
    private async readOverview(
        input: BriefPackInput,
    ): Promise<AiOverviewDto | null> {
        if (input.managerIds.length === 0) return null;
        const key = buildOverviewKey(
            input.domain,
            input.from,
            input.to,
            buildReportUsersKey(input.managerIds),
            false,
        );
        const entry = await this.cache.getJson<AiOverviewCacheEntry>(key);

        return entry && entry.status === 'ready' ? entry.data : null;
    }

    /**
     * Кэш эфирного времени месяца (модуль airtime того же приложения).
     * Сервис кэша создаётся вручную поверх глобального AppCache, чтобы не
     * тащить в модуль резюме AirtimeModule с его контроллерами
     * (прецедент — SalesFinanceCacheService).
     */
    private async readAirtime(
        domain: string,
        monthKey: string,
        managerIds: number[],
    ): Promise<BriefPackSources['airtime']> {
        if (managerIds.length === 0) return null;
        const cells = await new AirtimeCacheService(
            this.appCache,
        ).getMonthCells(domain, monthKey as IsoMonth, managerIds);
        let totalSeconds = 0;
        let filled = 0;
        for (const cell of cells.values()) {
            if (!cell) continue;
            totalSeconds += cell.airtimeSeconds;
            filled += 1;
        }

        return filled === 0 ? null : { totalSeconds, cells: filled };
    }

    private async readModel(
        domain: string,
        monthKey: string,
    ): Promise<PortalModelPayload | null> {
        const record = await this.snapshots.latestModel(domain, monthKey);

        return record && isModelPayload(record.payload) ? record.payload : null;
    }

    private async readMonths(
        domain: string,
        monthKey: string,
        managerIds: string[],
    ): Promise<BriefManagerRow<ManagerMonthPayload>[]> {
        const records = await this.snapshots.findManagerMonths(
            domain,
            [monthKey],
            {
                limit: AI_BRIEF_SNAPSHOT_LIMIT,
                ...(managerIds.length ? { managerIds } : {}),
            },
        );

        return toBriefRows(records, isMonthPayload);
    }

    private async readForecasts(
        domain: string,
        day: string,
        managerIds: string[],
    ): Promise<BriefManagerRow<ForecastPayload>[]> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            {
                periodKeys: [day],
                latestOnly: true,
                ...(managerIds.length ? { managerIds } : {}),
            },
        );

        return toBriefRows(records, isForecastPayload);
    }

    private async readWeeks(
        domain: string,
        day: string,
        managerIds: string[],
    ): Promise<BriefManagerRow<ManagerWeekPayload>[]> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            {
                periodKeys: [isoWeekKey(day)],
                latestOnly: true,
                ...(managerIds.length ? { managerIds } : {}),
            },
        );

        return toBriefRows(records, isWeekPayload);
    }
}
