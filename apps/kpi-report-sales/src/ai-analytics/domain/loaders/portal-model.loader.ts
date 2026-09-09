/**
 * Загрузчик входов месячной модели портала (план Фазы 2, поток 16a):
 * месячные снапшоты менеджеров за окно 6–12 месяцев и последняя
 * записанная модель портала.
 *
 * Единственный источник — таблица `ais` через существующий стор
 * снапшотов: Битрикс на месячном шаге не зовётся вовсе, поэтому шаг
 * укладывается в бюджет ночной джобы. Выборка всегда идёт ПО КЛЮЧАМ
 * ПЕРИОДОВ (индексы `ais` владельцем не подтверждены, §3.2), кроме
 * поиска последней модели — там окно `created_at` стора.
 *
 * Чужая или неполная нагрузка не роняет шаг: она читается структурно и
 * деградирует до нулей (штатная деградация §5.4).
 *
 * `@Injectable` без bitrix-состояния: только стор снапшотов.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type ManagerTypeFact,
} from '@lib/sales-ai-analytics';
import { AI_MONTH_KPI_CODES } from '../assembler/manager-month.facts';
import type { ManagerMonthPayload } from '../assembler/manager-snapshot.types';
import type {
    PortalManagerMonth,
    PortalModelPayload,
    PortalMonthEdge,
} from '../assembler/portal-model.types';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';

/** Записанная модель портала: id записи `ais` и её нагрузка. */
export interface PortalModelRecord {
    /** id записи `ais` — он же `meta.modelSnapshotId` потребителей. */
    id: string;
    /** Месяц модели 'YYYY-MM'. */
    monthKey: string;
    payload: Partial<PortalModelPayload>;
}

/** Коды KPI-вектора месяца, из которых модель берёт объёмы. */
type MonthKpiCode = (typeof AI_MONTH_KPI_CODES)[number];
const KPI_CALLS: MonthKpiCode = 'call_done';
const KPI_PRESENTATIONS: MonthKpiCode = 'presentation_uniq_done';

const numberOf = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Рёбра месяца в объёме норм: код, знаменатель и числитель. */
function edgesOf(payload: Partial<ManagerMonthPayload>): PortalMonthEdge[] {
    return (payload.edges ?? []).map(edge => ({
        edge: edge.edge,
        n: numberOf(edge.n),
        s: numberOf(edge.s),
    }));
}

/**
 * Средняя оценка месяца по шкале 1–10: взвешенная по объёму средняя
 * фактов типов. Разборов не было — null, а не ноль: «нет данных» и
 * «оценка ноль» это разные утверждения.
 */
function scoreOf(
    byType: readonly ManagerTypeFact[] | undefined,
): PortalManagerMonth['score'] {
    const facts = (byType ?? []).filter(
        fact => fact.score.value !== null && fact.score.n > 0,
    );
    const n = facts.reduce((sum, fact) => sum + fact.score.n, 0);
    if (n <= 0) return null;
    const total = facts.reduce(
        (sum, fact) => sum + (fact.score.value ?? 0) * fact.score.n,
        0,
    );

    return { value: total / n, n };
}

/** Нагрузка месячного снапшота → месяц менеджера в объёме модели. */
export function toPortalManagerMonth(
    monthKey: string,
    managerId: string,
    payload: Partial<ManagerMonthPayload>,
): PortalManagerMonth {
    const kpi = payload.kpi ?? {};

    return {
        monthKey,
        managerId,
        tenureBand: payload.passport?.tenureBand ?? null,
        edges: edgesOf(payload),
        excludeFromNorms: payload.exposure?.excludedFromNorms === true,
        workedDays: numberOf(payload.exposure?.dMt),
        daysSource: payload.exposure?.daysSource ?? null,
        callsDone: numberOf(kpi[KPI_CALLS]),
        presentations: numberOf(kpi[KPI_PRESENTATIONS]),
        salesCount: numberOf(payload.finance?.salesCount),
        averageCheck:
            typeof payload.finance?.averageCheck === 'number'
                ? payload.finance.averageCheck
                : null,
        planSales:
            typeof payload.planSnapshot?.sales === 'number'
                ? payload.planSnapshot.sales
                : null,
        level: typeof payload.level === 'string' ? payload.level : null,
        score: scoreOf(payload.byType),
    };
}

@Injectable()
export class PortalModelLoader {
    constructor(private readonly snapshots: AiAnalyticsSnapshotStore) {}

    /**
     * Месячные снапшоты менеджеров окна. Одна выборка на всё окно: ключи
     * периодов известны заранее, поэтому обхода по месяцам нет.
     */
    async loadMonths(
        domain: string,
        monthKeys: readonly string[],
    ): Promise<PortalManagerMonth[]> {
        if (monthKeys.length === 0) return [];
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            { periodKeys: [...monthKeys] },
        );

        return records.flatMap(record =>
            record.managerId === null
                ? []
                : [
                      toPortalManagerMonth(
                          record.periodKey,
                          record.managerId,
                          record.payload as Partial<ManagerMonthPayload>,
                      ),
                  ],
        );
    }

    /** Модель портала за конкретный месяц; null — записи нет. */
    async loadModel(
        domain: string,
        monthKey: string,
    ): Promise<PortalModelRecord | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            { periodKeys: [monthKey] },
        );
        const record = records[records.length - 1];

        return record === undefined ? null : toModelRecord(record);
    }

    /**
     * Последняя записанная модель портала: её читают прогноз (через
     * `meta.modelSnapshotId`) и деградация месячного шага.
     */
    async latestModel(domain: string): Promise<PortalModelRecord | null> {
        const record = await this.snapshots.latest(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            null,
        );

        return record === null ? null : toModelRecord(record);
    }
}

/** Запись стора → модель портала с id (его проставляют потребители). */
function toModelRecord(record: {
    id: string;
    periodKey: string;
    payload: unknown;
}): PortalModelRecord {
    return {
        id: record.id,
        monthKey: record.periodKey,
        payload: record.payload as Partial<PortalModelPayload>,
    };
}
