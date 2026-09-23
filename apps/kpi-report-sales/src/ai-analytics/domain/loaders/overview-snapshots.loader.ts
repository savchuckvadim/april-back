/**
 * Снапшоты Фазы 2 для витрины обзора (поток 16b): месячная модель
 * портала, дневные прогнозы менеджеров и месячные профили стиля.
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
import type {
    ForecastView,
    OverviewSnapshots,
    PortalModelView,
    StyleView,
} from '../assembler/overview-model.types';
import type { YoyMonthView } from '../presenter/yoy.presenter';
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
     * Снапшоты на конец периода обзора: модель за месяц окончания (иначе
     * последняя записанная), прогнозы за последний день периода (иначе за
     * предыдущий) и профили стиля за месяц окончания (иначе за прошлый).
     */
    async load(domain: string, to: string): Promise<OverviewSnapshots> {
        const monthKey = monthKeyOf(to);
        const [model, forecasts, styles] = await Promise.all([
            this.loadModel(domain, monthKey),
            this.loadForecasts(domain, to),
            this.loadStyles(domain, monthKey),
        ]);

        return { model, forecasts, styles };
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
