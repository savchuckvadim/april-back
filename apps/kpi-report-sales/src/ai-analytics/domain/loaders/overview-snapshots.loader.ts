/**
 * Снапшоты Фазы 2 для витрины обзора (поток 16b): месячная модель
 * портала, дневные прогнозы менеджеров и месячные профили стиля; с Фазы 3
 * (П1) — ещё и недельные тренды рядов менеджеров; паспорта месячных
 * снапшотов менеджеров — источник уровня и стажа строки обзора.
 *
 * Загрузчик НЕ инжектируемый: он создаётся поверх уже существующего
 * `AiAnalyticsSnapshotStore` (`new OverviewSnapshotsLoader(store)`), чтобы
 * не трогать модуль приложения — его правит только поток сборки (§1.6).
 *
 * Все выборки идут ПО КЛЮЧАМ ПЕРИОДОВ (индексы `ais` владельцем не
 * подтверждены, §3.2), кроме запасного поиска последней модели портала —
 * там окно `created_at` стора. Битрикс не зовётся вовсе: всё уже в `ais`.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    samePeriodKey,
    shiftDate,
} from '@lib/sales-ai-analytics';
import { readPassports } from '../assembler/bus-facts.util';
import type { ManagerPassportFacts } from '../assembler/manager-snapshot.types';
import type {
    ForecastView,
    GoldenReportView,
    OverviewSnapshots,
    PortalModelView,
    StyleView,
} from '../assembler/overview-model.types';
import type { TrendsView } from '../presenter/trends.presenter';
import type { YoyMonthView } from '../presenter/yoy.presenter';
import { isoWeekKey } from './period.util';
import {
    AiAnalyticsSnapshotStore,
    type AiAnalyticsSnapshotRecord,
} from '../../store/ai-analytics-snapshot.store';

/**
 * Сколько строк `manager-month` стор берёт за один месяц сравнения:
 * ростер портала с запасом. Выборка идёт по ключу месяца (не окном
 * `created_at`), но `findManagerMonths` требует `limit` явно.
 */
export const YOY_MONTHS_LIMIT = 500;

/** Ключ месяца 'YYYY-MM' по дате 'YYYY-MM-DD'. */
export const monthKeyOf = (date: string): string => date.slice(0, 7);

/**
 * Ключ того же месяца год назад (`M−12`, план Фазы 3 П3); ключ не месяц —
 * пары нет и читать нечего.
 */
export function yearAgoMonthKey(monthKey: string): string | null {
    return samePeriodKey(monthKey);
}

/** Ключи ISO-недель, под которыми ищется снапшот трендов: прошлая и текущая. */
export function trendWeekKeys(day: string): string[] {
    return [isoWeekKey(shiftDate(day, -7)), isoWeekKey(day)];
}

/** Предыдущий месяц ключа 'YYYY-MM'. */
export function previousMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return monthKey;
    }
    const shifted =
        month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };

    return `${shifted.y}-${String(shifted.m).padStart(2, '0')}`;
}

/** Записи по менеджеру: побеждает последняя по времени создания. */
function byManager<T>(
    records: readonly AiAnalyticsSnapshotRecord[],
): Map<string, T> {
    const result = new Map<string, T>();
    for (const record of records) {
        if (record.managerId === null) continue;
        result.set(record.managerId, record.payload as T);
    }

    return result;
}

/**
 * Паспорт из нагрузки `ai-analytics-manager-month` с id менеджера записи
 * (форма чужая — читается структурно, без паспорта записи нет).
 */
function passportEntryOf(
    record: AiAnalyticsSnapshotRecord,
): Record<string, unknown>[] {
    const payload: unknown = record.payload;
    if (typeof payload !== 'object' || payload === null) return [];
    const passport = (payload as { passport?: unknown }).passport;

    return typeof passport === 'object' && passport !== null
        ? [{ ...passport, managerId: record.managerId }]
        : [];
}

/**
 * Месяцы менеджеров для сравнения «год назад» (план Фазы 3, П3): месяц
 * окончания периода и тот же месяц годом ранее. Отдельный интерфейс,
 * а не поле `OverviewSnapshots`: контракт снапшотов Фазы 2 правит
 * соседний поток, и расширять его здесь нельзя.
 */
export interface OverviewYoySnapshots {
    /** Месяц витрины 'YYYY-MM'. */
    monthKey: string;
    /** Тот же месяц год назад 'YYYY-MM'; null — ключ не месяц. */
    baseMonthKey: string | null;
    /** Месяц витрины по менеджеру. */
    months: ReadonlyMap<string, YoyMonthView>;
    /** Месяц год назад по менеджеру; пусто — истории M−12 нет. */
    baseMonths: ReadonlyMap<string, YoyMonthView>;
}

export class OverviewSnapshotsLoader {
    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    /**
     * Месяцы менеджеров для блока «год назад»: месяц окончания периода и
     * месяц M−12 одной выборкой по двум ключам (индексов по ключу нет —
     * `findManagerMonths` требует явный `limit`). Битрикс не зовётся.
     *
     * Истории M−12 нет — `baseMonths` пуст, и блок витрины становится
     * `null`: ни одного числа наружу (приёмка П3).
     */
    async loadYoy(domain: string, to: string): Promise<OverviewYoySnapshots> {
        const monthKey = monthKeyOf(to);
        const baseMonthKey = yearAgoMonthKey(monthKey);
        const keys =
            baseMonthKey === null ? [monthKey] : [baseMonthKey, monthKey];
        const records = await this.snapshots.findManagerMonths(domain, keys, {
            limit: YOY_MONTHS_LIMIT * keys.length,
        });

        return {
            monthKey,
            baseMonthKey,
            months: byManager<YoyMonthView>(
                records.filter(record => record.periodKey === monthKey),
            ),
            baseMonths:
                baseMonthKey === null
                    ? new Map<string, YoyMonthView>()
                    : byManager<YoyMonthView>(
                          records.filter(
                              record => record.periodKey === baseMonthKey,
                          ),
                      ),
        };
    }

    /**
     * Паспорта менеджеров на конец периода — тот же источник уровня и
     * стажа, что у ночного конвейера (`buildLevelFacts`): месячный
     * снапшот месяца окончания периода, а без него — прошлого месяца
     * (текущий месяц 1-го числа ещё не записан). При обоих побеждает
     * месяц окончания. Разбор паспорта — читателем шины `readPassports`,
     * чтобы правило чтения было одно. Битрикс не зовётся.
     */
    async loadPassports(
        domain: string,
        to: string,
    ): Promise<Map<string, ManagerPassportFacts>> {
        const monthKey = monthKeyOf(to);
        const keys = [previousMonthKey(monthKey), monthKey];
        const records = await this.snapshots.findManagerMonths(domain, keys, {
            limit: YOY_MONTHS_LIMIT * keys.length,
        });

        return readPassports(
            [...records]
                .sort((left, right) =>
                    left.periodKey.localeCompare(right.periodKey),
                )
                .flatMap(passportEntryOf),
        );
    }

    /**
     * Снапшоты на конец периода обзора: модель за месяц окончания (иначе
     * последняя записанная), прогнозы за последний день периода (иначе за
     * предыдущий) и профили стиля за месяц окончания (иначе за прошлый).
     */
    async load(domain: string, to: string): Promise<OverviewSnapshots> {
        const monthKey = monthKeyOf(to);
        const [model, forecasts, styles, trends, goldenReport] =
            await Promise.all([
                this.loadModel(domain, monthKey),
                this.loadForecasts(domain, to),
                this.loadStyles(domain, monthKey),
                this.loadTrends(domain, to),
                this.loadGoldenReport(domain),
            ]);

        return { model, forecasts, styles, trends, goldenReport };
    }

    /** Последний отчёт согласия портала (П7): источник σ_llm для готовности. */
    private async loadGoldenReport(
        domain: string,
    ): Promise<GoldenReportView | null> {
        const record = await this.snapshots.latest(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
            null,
        );

        return record === null ? null : (record.payload as GoldenReportView);
    }

    /**
     * Тренды менеджеров (Фаза 3, П1): снапшот `ai-analytics-trends` за
     * ISO-неделю окончания периода либо за предыдущую. Шаг трендов пишет
     * его раз в неделю по закрытой неделе, поэтому для периода «по
     * сегодня» свежая запись лежит под ключом прошлой недели; при двух
     * записях побеждает более поздняя неделя.
     */
    private async loadTrends(
        domain: string,
        day: string,
    ): Promise<Map<string, TrendsView>> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.trends,
            { periodKeys: trendWeekKeys(day), latestOnly: true },
        );

        return byManager<TrendsView>(
            [...records].sort((left, right) =>
                left.periodKey.localeCompare(right.periodKey),
            ),
        );
    }

    /** Модель портала за месяц; нет за месяц — последняя записанная. */
    private async loadModel(
        domain: string,
        monthKey: string,
    ): Promise<PortalModelView | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            { periodKeys: [monthKey, previousMonthKey(monthKey)] },
        );
        // Модель своего месяца всегда старше по смыслу, даже если запись
        // прошлого месяца создана позже (пересчёт прошлого месяца
        // backfill'ом идёт после текущего).
        const ofMonth = records.filter(item => item.periodKey === monthKey);
        const record =
            ofMonth[ofMonth.length - 1] ??
            records[records.length - 1] ??
            (await this.snapshots.latest(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
                null,
            ));

        return record === null || record === undefined
            ? null
            : (record.payload as PortalModelView);
    }

    /** Прогнозы менеджеров за последний день периода либо за предыдущий. */
    private async loadForecasts(
        domain: string,
        day: string,
    ): Promise<Map<string, ForecastView>> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
            { periodKeys: [shiftDate(day, -1), day] },
        );

        return byManager<ForecastView>(records);
    }

    /** Профили стиля менеджеров за месяц окончания периода или прошлый. */
    private async loadStyles(
        domain: string,
        monthKey: string,
    ): Promise<Map<string, StyleView>> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            { periodKeys: [previousMonthKey(monthKey), monthKey] },
        );

        return byManager<StyleView>(records);
    }
}
