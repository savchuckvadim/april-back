/**
 * Чтение источников пакета AI-резюме (версия 2): кэш витрины (пульс,
 * обзор текущего и прошлого окна, факты прошлого периода, повестка,
 * эфирное время) и снапшоты ночного конвейера (модель, месяц конца
 * периода, прогноз, недели при промахе пульса).
 *
 * В Bitrix и в транскрипции читатель не ходит, тяжёлых загрузчиков не
 * зовёт — только кэш и снапшоты; поэтому пакет собирается синхронно в
 * ручке. Вынесено из `evidence-pack.builder.ts` по лимиту 300 строк.
 * Не `@Injectable`: создаётся сборщиком поверх его зависимостей.
 */
import { AppCacheService } from '@lib/app-cache';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    previousPeriod,
    previousWorkday,
    toPortalDate,
    type BriefPeriod,
} from '@lib/sales-ai-analytics';
import { AirtimeCacheService } from '../../airtime/cache/airtime-cache.service';
import type { IsoMonth } from '../../shared/lib/month-segments.util';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import { buildAgendaKey, buildPulseKey } from '../cache/cache-key.util';
import { AI_BRIEF_SNAPSHOT_LIMIT } from '../constants/ai-brief.const';
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import type {
    ManagerMonthPayload,
    ManagerWeekPayload,
} from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { isoWeekKey } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import type { AiAgendaDto } from '../dto/ai-agenda.dto';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { buildBriefPrevKey } from './brief-cache-key.util';
import { BriefOverviewReader } from './brief-overview.reader';
import {
    isAgendaDto,
    isForecastPayload,
    isModelPayload,
    isMonthPayload,
    isWeekPayload,
    toBriefRows,
} from './evidence-pack.parse';
import {
    extractPrevFacts,
    hasPrevNumbers,
    isPrevFacts,
    type BriefPrevFacts,
} from './evidence-pack.prev';
import type {
    BriefManagerRow,
    BriefPackInput,
    BriefPackSources,
} from './evidence-pack.types';

export class EvidencePackSourceReader {
    private readonly overviews: BriefOverviewReader;

    constructor(
        private readonly cache: AiAnalyticsCacheService,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly settings: SettingsLoader,
        private readonly appCache: AppCacheService,
    ) {
        this.overviews = new BriefOverviewReader(cache);
    }

    /** Кэш витрины и снапшоты конвейера за период пакета и прошлый период. */
    async load(input: BriefPackInput): Promise<BriefPackSources> {
        const { domain, from, to, managerIds } = input;
        const monthKey = to.slice(0, 7);
        const prev = previousPeriod(from, to);
        const { calendar } = await this.settings.load(domain);
        const today = toPortalDate(input.now ?? new Date(), calendar.timeZone);
        const ids = managerIds.map(String);
        const [
            pulse,
            overview,
            overviewPrev,
            agenda,
            airtime,
            model,
            months,
            forecasts,
        ] = await Promise.all([
            this.readPulse(domain, previousWorkday(today, calendar)),
            this.overviews.read(domain, { from, to }, managerIds),
            this.overviews.read(domain, prev, managerIds),
            this.readAgenda(domain, today),
            this.readAirtime(domain, monthKey, managerIds),
            this.readModel(domain, monthKey),
            this.readMonths(domain, monthKey, ids),
            this.readForecasts(domain, to, ids),
        ]);
        const weeks = pulse ? [] : await this.readWeeks(domain, to, ids);
        const prevFacts = await this.readPrevFacts(input, prev, overviewPrev);
        const comparableFrom =
            overview?.readiness.comparableFrom ||
            model?.readiness.comparableFrom ||
            '';

        return {
            pulse,
            overview,
            prevFacts,
            agenda,
            airtime,
            model,
            months,
            forecasts,
            weeks,
            comparableFrom,
            previousPeriod: prev,
            beforeComparable:
                comparableFrom !== '' && prev.from < comparableFrom,
        };
    }

    /** Кэш пульса за последний рабочий день портала (ключ ручки pulse). */
    private readPulse(
        domain: string,
        endDate: string,
    ): Promise<AiPulseDto | null> {
        return this.cache.getJson<AiPulseDto>(buildPulseKey(domain, endDate));
    }

    /**
     * Факты прошлого периода: кэш `brief:prev` с числами (его пишет джоба
     * резюме, дождавшись обзора прошлого окна), иначе выжимка из кэша
     * обзора прошлого окна, иначе пометка «расчёт не готов» из того же
     * кэша; нет ничего — null. Готовый обзор сильнее пометки: она лишь
     * говорит, что прошлая попытка его не дождалась.
     */
    private async readPrevFacts(
        input: BriefPackInput,
        prev: BriefPeriod,
        overviewPrev: AiOverviewDto | null,
    ): Promise<BriefPrevFacts | null> {
        const key = buildBriefPrevKey(
            input.domain,
            prev.from,
            prev.to,
            input.managerIds,
        );
        const stored = await this.cache.getJson<unknown>(key);
        const cached = isPrevFacts(stored) ? stored : null;
        if (hasPrevNumbers(cached)) return cached;

        return overviewPrev
            ? extractPrevFacts(overviewPrev, prev, input.managerIds.map(String))
            : cached;
    }

    /** Кэш повестки планёрки текущей недели портала. */
    private async readAgenda(
        domain: string,
        today: string,
    ): Promise<AiAgendaDto | null> {
        const cached = await this.cache.getJson<unknown>(
            buildAgendaKey(domain, isoWeekKey(today)),
        );

        return isAgendaDto(cached) ? cached : null;
    }

    /**
     * Кэш эфирного времени месяца (модуль airtime того же приложения) по
     * периметру резюме, а без него — по кэшированному ростеру портала.
     * Сервис кэша создаётся вручную поверх глобального AppCache, чтобы не
     * тащить в модуль резюме AirtimeModule с его контроллерами
     * (прецедент — SalesFinanceCacheService).
     */
    private async readAirtime(
        domain: string,
        monthKey: string,
        managerIds: readonly number[],
    ): Promise<BriefPackSources['airtime']> {
        const scope = await this.overviews.scope(domain, managerIds);
        if (scope.length === 0) return null;
        const cells = await new AirtimeCacheService(
            this.appCache,
        ).getMonthCells(domain, monthKey as IsoMonth, scope);
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

    /** Месячные снапшоты месяца конца периода. */
    private async readMonths(
        domain: string,
        monthKey: string,
        managerIds: readonly string[],
    ): Promise<BriefManagerRow<ManagerMonthPayload>[]> {
        const records = await this.snapshots.findManagerMonths(
            domain,
            [monthKey],
            {
                limit: AI_BRIEF_SNAPSHOT_LIMIT,
                ...(managerIds.length ? { managerIds } : {}),
            },
        );

        return toBriefRows(records, isMonthPayload).filter(
            row => row.periodKey === monthKey,
        );
    }

    private async readForecasts(
        domain: string,
        day: string,
        managerIds: readonly string[],
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
        managerIds: readonly string[],
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
