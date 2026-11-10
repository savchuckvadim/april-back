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
import {
    AGENT_ANALYSIS_FACTS_TYPE,
    AGENT_ANALYSIS_RETEST_TYPE,
    AGENT_ANALYSIS_TYPE,
} from '@lib/call-lib';
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
    AGENT_ANALYSIS_FACTS_TYPE,
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

/** Расход по поставщику шлюза LLM — из `usage.byProvider` разборов (B3). */
export interface CostByProvider {
    /** Код поставщика (vibecode, openai-compatible, ai-rag); unknown — записи без сведений. */
    provider: string;
    /** Записей, в которых поставщик отвечал. */
    calls: number;
    tokens: number;
    /** Доля стоимости записей по колонке price пропорционально токенам, ₽. */
    price: number;
    /**
     * Оценка по цене реестра поставщика (llm_price_per_1k_<provider>), а
     * без неё — по общей; null — цена не задана.
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
    /** Разбивка по поставщикам шлюза, крупные первыми. */
    byProvider: CostByProvider[];
}

const TOKENS_PER_PRICE_UNIT = 1000;
const PROVIDER_UNKNOWN = 'unknown';
const PRICE_DECIMALS = 4;

/** Код реестра цены поставщика; нет — общая цена. */
const PRICE_CODE_BY_PROVIDER: Readonly<Record<string, string>> = {
    vibecode: 'llm_price_per_1k_vibecode',
    'openai-compatible': 'llm_price_per_1k_openai_compatible',
    'ai-rag': 'llm_price_per_1k_ai_rag',
};

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
            byProvider: costByProvider(
                records.filter(record => record.tokensCount > 0),
                pricePerThousand,
            ),
        };
    }
}

interface ProviderShare {
    provider: string;
    tokens: number;
}

const isProviderShare = (value: unknown): value is ProviderShare =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === 'string' &&
    typeof (value as { tokens?: unknown }).tokens === 'number';

/**
 * Разбивка записи по поставщикам из `user_result.usage.byProvider`;
 * токены сверх разбивки (или вся запись до B3) — поставщику unknown.
 */
function providerSharesOf(record: {
    tokensCount: number;
    userResult: unknown;
}): ProviderShare[] {
    const usage = (record.userResult as { usage?: unknown } | null)?.usage;
    const list = (usage as { byProvider?: unknown } | undefined)?.byProvider;
    const shares = (Array.isArray(list) ? list : [])
        .filter(isProviderShare)
        .map(share => ({ provider: share.provider, tokens: share.tokens }));
    const rest = record.tokensCount - sum(shares, share => share.tokens);
    return rest > 0
        ? [...shares, { provider: PROVIDER_UNKNOWN, tokens: rest }]
        : shares;
}

function providerPrice(provider: string, fallback: number): number {
    const code = PRICE_CODE_BY_PROVIDER[provider];
    const own = code === undefined ? 0 : registryDefault(code, 0);
    return own > 0 ? own : fallback;
}

/** Суммы по поставщикам: стоимость записи делится по токенам поставщиков. */
export function costByProvider(
    records: readonly {
        tokensCount: number;
        price: number;
        userResult: unknown;
    }[],
    pricePerThousand: number,
): CostByProvider[] {
    const acc = new Map<
        string,
        { calls: number; tokens: number; price: number }
    >();
    for (const record of records) {
        const shares = providerSharesOf(record);
        const total = sum(shares, share => share.tokens);
        for (const share of shares) {
            const entry = acc.get(share.provider) ?? {
                calls: 0,
                tokens: 0,
                price: 0,
            };
            entry.calls += 1;
            entry.tokens += share.tokens;
            entry.price +=
                total > 0 ? record.price * (share.tokens / total) : 0;
            acc.set(share.provider, entry);
        }
    }
    return [...acc]
        .map(([provider, entry]) => ({
            provider,
            calls: entry.calls,
            tokens: entry.tokens,
            price: round(entry.price, PRICE_DECIMALS),
            estimatedPrice: estimate(
                entry.tokens,
                providerPrice(provider, pricePerThousand),
            ),
        }))
        .sort((a, b) => b.tokens - a.tokens);
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
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
