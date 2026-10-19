/**
 * Расход языковой модели по порталу за месяц (план Фазы 3, П5; решение
 * владельца B2 от 21.09.2026): токены и стоимость живут в колонках той же
 * ais-записи (`tokens_count`, `price`), поэтому расход по всем типам
 * считается одним чтением окна.
 *
 * Кроме снапшотов AI-аналитики учитываются записи глубокого разбора
 * звонков (`agent-analysis`, с 20.10.2026 несут tokens_count / price) и
 * его test-retest повторов (`agent-analysis-retest`): это основной
 * расход контура, без него отчёт показывал бы только резюме.
 *
 * Цена берётся из реестра параметров (`llm_price_per_1k`). Ноль означает
 * «цена не задана»: тогда стоимость считается только по колонке `price`
 * записей, а отсутствующая цена помечается `estimated = true` — ровно та
 * же трактовка, что у `brief-job.util.ts` приложения.
 */
import { Injectable } from '@nestjs/common';
import { AGENT_ANALYSIS_RETEST_TYPE, AGENT_ANALYSIS_TYPE } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_TYPES } from '../../contracts/snapshot-kinds.const';
import { registryDefault } from '../../params/registry.access';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';

/**
 * Типы ais-записей, чей расход считает ручка: снапшоты AI-аналитики (в
 * порядке таблицы §3.1), затем разбор звонков и его повторы.
 */
export const AI_ANALYTICS_COST_TYPES = [
    ...AI_ANALYTICS_SNAPSHOT_TYPES,
    AGENT_ANALYSIS_TYPE,
    AGENT_ANALYSIS_RETEST_TYPE,
] as const;
export type AiAnalyticsCostType = (typeof AI_ANALYTICS_COST_TYPES)[number];

/** Расход по одному типу записи. */
export interface CostByType {
    type: AiAnalyticsCostType;
    /** Записей с вызовом модели (tokens_count > 0). */
    calls: number;
    tokens: number;
    /** Стоимость по колонке price, ₽. */
    price: number;
    /**
     * Стоимость по цене реестра: токены / 1000 × llm_price_per_1k, ₽;
     * null — цена реестра не задана (0).
     */
    estimatedPrice: number | null;
}

/** Ответ ручки `GET admin/ai-analytics/cost`. */
export interface CostSummary {
    domain: string;
    /** Месяц 'YYYY-MM' в TZ портала (границы — по UTC от created_at). */
    month: string;
    /** Цена 1 000 токенов из реестра, ₽; 0 — не задана. */
    pricePerThousand: number;
    /**
     * Цена реестра нулевая либо записи не несут price: числа ниже —
     * оценка, а не факт биллинга.
     */
    estimated: boolean;
    calls: number;
    tokens: number;
    /** Стоимость по колонкам price, ₽. */
    price: number;
    /** Стоимость по цене реестра, ₽; null — цена не задана. */
    estimatedPrice: number | null;
    byType: CostByType[];
}

const TOKENS_PER_PRICE_UNIT = 1000;

@Injectable()
export class AiAnalyticsCostService {
    constructor(private readonly store: AiAnalyticsAdminSnapshotStore) {}

    /** Расход домена за календарный месяц 'YYYY-MM'. */
    async summary(domain: string, month: string): Promise<CostSummary> {
        const { from, to } = monthBounds(month);
        const records = await this.store.readRaw(
            domain,
            AI_ANALYTICS_COST_TYPES,
            { from, to },
        );
        const pricePerThousand = registryDefault('llm_price_per_1k');
        const byType = AI_ANALYTICS_COST_TYPES.flatMap(type =>
            costOfType(
                type,
                records.filter(
                    record => record.type === type && record.tokensCount > 0,
                ),
                pricePerThousand,
            ),
        );
        const tokens = sum(byType, entry => entry.tokens);
        const price = sum(byType, entry => entry.price);
        return {
            domain,
            month,
            pricePerThousand,
            estimated: pricePerThousand === 0 || price === 0,
            calls: sum(byType, entry => entry.calls),
            tokens,
            price,
            estimatedPrice: estimate(tokens, pricePerThousand),
            byType,
        };
    }
}

function costOfType(
    type: AiAnalyticsCostType,
    records: readonly { tokensCount: number; price: number }[],
    pricePerThousand: number,
): CostByType[] {
    if (records.length === 0) return [];
    const tokens = sum(records, record => record.tokensCount);
    return [
        {
            type,
            calls: records.length,
            tokens,
            price: sum(records, record => record.price),
            estimatedPrice: estimate(tokens, pricePerThousand),
        },
    ];
}

/** Оценка стоимости по цене реестра; цена 0 → null («не задана»). */
function estimate(tokens: number, pricePerThousand: number): number | null {
    return pricePerThousand > 0
        ? (tokens / TOKENS_PER_PRICE_UNIT) * pricePerThousand
        : null;
}

function sum<T>(items: readonly T[], pick: (item: T) => number): number {
    return items.reduce((total, item) => total + pick(item), 0);
}

/** Границы месяца 'YYYY-MM' в UTC: [1-е 00:00, 1-е следующего 00:00). */
export function monthBounds(month: string): { from: Date; to: Date } {
    const [year, index] = month.split('-').map(Number);
    return {
        from: new Date(Date.UTC(year, index - 1, 1)),
        to: new Date(Date.UTC(year, index, 1)),
    };
}
