/**
 * Чистый разбор входов пула порталов (Фаза 4, П17/П22): участие и дата
 * согласия, выбор записи месяца, нормы рёбер, таблица лага, чек, сезон и
 * β из нагрузок модели портала и оценки связи качества → `PoolPortalInput`.
 *
 * Отделено от `pool-portals.loader.ts` по лимиту 300 строк: загрузчик
 * ходит в стор, разбор — здесь. Чужая или старая форма нагрузки
 * деградирует до «нет данных», а не роняет пул (§5.4).
 */
import {
    AI_ANALYTICS_EDGE_VIEW_MAP,
    AI_EDGE_CODES,
    AI_EDGE_ESTIMANDS,
    AI_LAG_CDF_KINDS,
    isAiEdgeCode,
    isIsoDate,
    lagCdfFromTable,
    type AiEdgeCode,
    type AiQualityLinkStatus,
    type LagCdf,
    type LagCdfPoint,
    type LognormalCheckSource,
    type PoolLognormal,
    type PoolPortalBeta,
    type PoolPortalEdge,
    type PoolPortalInput,
    type SeasonIndexSource,
} from '@lib/sales-ai-analytics';
import { monthBounds } from '../../constants/ai-manager-snapshot.const';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.types';
import { snapshotHashKey } from '../../store/snapshot-serialize.util';
import type { AiAnalyticsPortalSettings } from './settings.loader';

type Unknown = Record<string, unknown>;

/** Длина индекса сезона — 12 месяцев года. */
const SEASON_LENGTH = 12;

/**
 * Источник чека и сезона в старых снапшотах (без поля `own`): только
 * собственная оценка портала — дефолты реестра, усадка к прайору и чужой
 * пул не усредняются. Новые снапшоты несут несжатую оценку в `own`.
 */
const CHECK_SOURCE: LognormalCheckSource = 'estimated';
const SEASON_SOURCE: SeasonIndexSource = 'estimated';

/** Статусы оценки связи качества, у которых есть β с SE. */
const QUALITY_LINK_WITH_BETA: readonly AiQualityLinkStatus[] = [
    'estimated',
    'published',
];

const asRecord = (value: unknown): Unknown | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Unknown)
        : null;

const asFinite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Обезличенный ключ портала в пуле. */
export const poolPortalKeyOf = (domain: string): string =>
    snapshotHashKey([domain]);

/** Портал согласился на пул: флаг и дата согласия заданы. */
export const isPoolParticipant = (
    settings: Pick<AiAnalyticsPortalSettings, 'poolOptIn' | 'poolConsentAt'>,
): boolean => settings.poolOptIn && settings.poolConsentAt !== null;

/** Дата согласия 'YYYY-MM-DD'; иной формат — null («нет согласия»). */
export function consentDateOf(consentAt: string | null): string | null {
    const day = consentAt?.trim().slice(0, 10) ?? '';

    return isIsoDate(day) ? day : null;
}

/**
 * Согласие в силе на день `day` ('YYYY-MM-DD'): флаг, разборчивая дата и
 * дата не позже дня. Тот же вердикт, что `buildPool` даст порталу, — но
 * до чтения чужих порталов.
 */
export function consentInForce(
    settings: Pick<AiAnalyticsPortalSettings, 'poolOptIn' | 'poolConsentAt'>,
    day: string,
): boolean {
    const consent = settings.poolOptIn
        ? consentDateOf(settings.poolConsentAt)
        : null;

    return consent !== null && consent <= day;
}

/**
 * День, на который проверяется согласие на пул для месяца `monthKey` —
 * последний день месяца. Одна граница у шага пула и у модели портала:
 * согласие, данное после конца месяца (например, 2-го, а заморозка 3-го),
 * действует с СЛЕДУЮЩЕГО месяца — иначе пул месяца писался бы и читал
 * чужие порталы, а модель того же месяца его не брала.
 */
export const poolConsentDayOf = (monthKey: string): string =>
    monthBounds(monthKey).to;

/**
 * Запись для пула месяца `monthKey`: самый поздний месяц не позже
 * расчётного, а не последняя по времени записи. Догон истории пишет
 * прошлые месяцы ПОСЛЕ текущего — «последняя записанная» была бы старой,
 * а при догоне прошлого месяца пул видел бы модели из будущего.
 */
export function recordUpTo(
    records: readonly AiAnalyticsSnapshotRecord[],
    monthKey: string,
): AiAnalyticsSnapshotRecord | null {
    let best: AiAnalyticsSnapshotRecord | null = null;
    for (const record of records) {
        if (record.periodKey > monthKey) continue;
        if (best === null || record.periodKey >= best.periodKey) {
            best = record;
        }
    }

    return best;
}

/** Код ребра витрины (`presentation_to_offer`) → ребро канона (`e2`). */
function canonEdgeOf(value: unknown): AiEdgeCode | null {
    if (typeof value !== 'string') return null;
    if (isAiEdgeCode(value)) return value;

    return (
        AI_EDGE_CODES.find(
            code => AI_ANALYTICS_EDGE_VIEW_MAP[code] === value,
        ) ?? null
    );
}

/**
 * Нормы рёбер модели портала в трактовке портала (`edgeKind`). Трактовка
 * неизвестна — рёбер нет: доли и интенсивности в одной норме пула
 * смешивать нельзя.
 */
export function poolEdgesOf(payload: Unknown): PoolPortalEdge[] {
    const estimand = AI_EDGE_ESTIMANDS.find(item => item === payload.edgeKind);
    if (estimand === undefined) return [];
    const edges = Array.isArray(payload.edges) ? payload.edges : [];

    return edges.flatMap((item: unknown): PoolPortalEdge[] => {
        const row = asRecord(item);
        const edge = canonEdgeOf(row?.edge);
        const mu = asFinite(row?.mu);
        const kappa = asFinite(row?.kappa);
        const n = asFinite(row?.n);

        return edge !== null && mu !== null && kappa !== null && n !== null
            ? [{ edge, estimand, mu, kappa, n }]
            : [];
    });
}

/** Таблица `F(d)` модели портала; без продаж (n = 0) — null. */
export function poolLagCdfOf(value: unknown): LagCdf | null {
    const table = asRecord(value);
    const kind = AI_LAG_CDF_KINDS.find(item => item === table?.kind);
    const n = asFinite(table?.n);
    const points = (Array.isArray(table?.points) ? table.points : []).flatMap(
        (item: unknown): LagCdfPoint[] => {
            const point = asRecord(item);
            const days = asFinite(point?.days);
            const pointValue = asFinite(point?.value);

            return days === null || pointValue === null
                ? []
                : [{ days, value: pointValue }];
        },
    );
    if (kind === undefined || n === null || n <= 0 || points.length === 0) {
        return null;
    }

    return lagCdfFromTable(points, { kind, n });
}

/** Тройка `{m, v, n}` чека с продажами; иная форма — null. */
function lognormalOf(value: unknown): PoolLognormal | null {
    const check = asRecord(value);
    const m = asFinite(check?.m);
    const v = asFinite(check?.v);
    const n = asFinite(check?.n);

    return m !== null && v !== null && n !== null && n > 0 ? { m, v, n } : null;
}

/**
 * Логнормальный чек портала из поля `checkLognormal` модели Фазы 4:
 * собственная несжатая оценка `own` (модель усаживает чек к прайору
 * с κ = 20, поэтому `source` там почти всегда `shrunk`), а в старых
 * снапшотах без `own` — только чистая оценка `estimated`.
 */
export function poolLognormalOf(payload: Unknown): PoolLognormal | null {
    const check = asRecord(payload.checkLognormal);
    if (check !== null && 'own' in check) return lognormalOf(check.own);

    return check?.source === CHECK_SOURCE ? lognormalOf(check) : null;
}

/** 12 положительных множителей; иная форма — null. */
function seasonSeriesOf(value: unknown): number[] | null {
    return Array.isArray(value) &&
        value.length === SEASON_LENGTH &&
        value.every(item => asFinite(item) !== null && Number(item) > 0)
        ? value.map(Number)
        : null;
}

/**
 * 12 множителей сезона: собственный индекс до усадки `own` поля
 * `seasonIndex` модели Фазы 4; в старых снапшотах без `own` — `index`
 * поля `seasonIndex` либо `season` той же формы только с источником
 * `estimated` (пул и усадка к пулу повторно не усредняются).
 */
export function poolSeasonIndexOf(payload: Unknown): number[] | null {
    const own = asRecord(payload.seasonIndex);
    if (own !== null && 'own' in own) return seasonSeriesOf(own.own);
    for (const candidate of [payload.seasonIndex, payload.season]) {
        const season = asRecord(candidate);
        const index = seasonSeriesOf(season?.index);
        if (season?.source === SEASON_SOURCE && index !== null) return index;
    }

    return null;
}

/** β портала из последнего снапшота `quality-link`; без оценки — null. */
export function poolBetaOf(payload: unknown): PoolPortalBeta | null {
    const link = asRecord(payload);
    const pooled = asRecord(link?.pooled);
    const value = asFinite(pooled?.value);
    const se = asFinite(pooled?.se);
    const n = asFinite(asRecord(link?.sample)?.n);
    const status = link?.status;

    return QUALITY_LINK_WITH_BETA.some(item => item === status) &&
        value !== null &&
        se !== null &&
        se > 0 &&
        n !== null &&
        n > 0
        ? { value, se, n }
        : null;
}

/**
 * Месяцев наблюдения портала: `readiness.historyMonths` модели (глубина
 * истории, до 12). Окно модели (`window`) для этого не годится — в нём
 * всегда 12 ключей месяцев, и гейт короткой истории пула не срабатывал бы.
 */
export function poolHistoryMonthsOf(payload: Unknown): number {
    const months = asFinite(asRecord(payload.readiness)?.historyMonths);

    return months === null ? 0 : Math.max(0, Math.floor(months));
}

/** Вход пула по одному порталу из модели портала и оценки связи качества. */
export function poolPortalInputOf(input: {
    readonly portalKey: string;
    readonly consentAt: string | null;
    readonly model: unknown;
    readonly qualityLink: unknown;
}): PoolPortalInput {
    const model = asRecord(input.model) ?? {};

    return {
        portalKey: input.portalKey,
        consentAt: consentDateOf(input.consentAt),
        historyMonths: poolHistoryMonthsOf(model),
        managers: asFinite(model.managers) ?? 0,
        edges: poolEdgesOf(model),
        beta: poolBetaOf(input.qualityLink),
        lagCdf: poolLagCdfOf(model.lagCdf),
        lognormal: poolLognormalOf(model),
        seasonIndex: poolSeasonIndexOf(model),
    };
}
