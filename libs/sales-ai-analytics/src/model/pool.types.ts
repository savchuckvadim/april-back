/**
 * Типы пула порталов (план §4.4 «Пул», §4.2 усадка к пулу, §4.7 SI_0,
 * §4.11 квартальный ритм, §4.10 E2). Режим владельца А.3: одно-портальный
 * режим первичен, пул строится только из порталов с датированным согласием
 * и достаточной историей; в результат попадают только обезличенные ключи.
 *
 * Чистые типы: без DI, Bitrix и Prisma.
 */
import type { AiEdgeCode } from '../params/registry.edges.const';
import type { ParamEdgeEstimand } from '../params/registry.types';
import type { LagCdf, LagCdfPoint } from './lag-cdf';

/** Оценка β портала из quality-link: наклон, его SE и объём исходов. */
export interface PoolPortalBeta {
    readonly value: number;
    readonly se: number;
    readonly n: number;
}

/** Норма ребра портала: μ, κ и знаменатель окна оценки. */
export interface PoolPortalEdge {
    readonly edge: AiEdgeCode;
    /** Трактовка ребра портала: вероятность или интенсивность. */
    readonly estimand: ParamEdgeEstimand;
    readonly mu: number;
    readonly kappa: number;
    readonly n: number;
}

/** Логнормальный чек портала: медиана и дисперсия логарифма, объём. */
export interface PoolLognormal {
    readonly m: number;
    readonly v: number;
    readonly n: number;
}

/** Вход пула по одному порталу — собирает приложение из PortalModelSnapshot. */
export interface PoolPortalInput {
    /** Обезличенный хэш домена (считает приложение), не домен. */
    readonly portalKey: string;
    /** Дата согласия 'YYYY-MM-DD'; null — согласия нет. */
    readonly consentAt: string | null;
    /** Месяцев сравнимой истории модели портала. */
    readonly historyMonths: number;
    /** Менеджеров в окне модели. */
    readonly managers: number;
    readonly edges: readonly PoolPortalEdge[];
    /** Оценка β портала; null — режим до гейта. */
    readonly beta: PoolPortalBeta | null;
    /** Таблица F(d) портала с объёмом продаж n; null — не оценена. */
    readonly lagCdf: LagCdf | null;
    readonly lognormal: PoolLognormal | null;
    /** 12 множителей сезона; только оценённый индекс, иначе null. */
    readonly seasonIndex: readonly number[] | null;
}

/** Источник τ²: оценка ДерСимоняна–Лэрда либо half-normal прайор. */
export const AI_POOL_TAU2_SOURCES = ['estimated', 'prior'] as const;
export type PoolTau2Source = (typeof AI_POOL_TAU2_SOURCES)[number];

/** Метка оценки β пула: собственная или гибрид с прайором τ. */
export const AI_POOL_BETA_LABELS = ['estimated', 'hybrid'] as const;
export type PoolBetaLabel = (typeof AI_POOL_BETA_LABELS)[number];

/** Иерархическая оценка β по порталам пула (план §4.4 «Пул»). */
export interface PoolBeta {
    /** β_R — оценка случайных эффектов. */
    readonly betaPool: number;
    /** SE β_R. */
    readonly se: number;
    readonly ci90: readonly [number, number];
    /** Q Кокрана. */
    readonly q: number;
    /** Степени свободы k − 1. */
    readonly df: number;
    /** I² = max(0, (Q − df)/Q). */
    readonly iSquared: number;
    readonly tau2: number;
    readonly tau2Source: PoolTau2Source;
    readonly label: PoolBetaLabel;
    /** Порталов в оценке. */
    readonly portals: number;
}

/** Усадка β портала к пулу: β_p = (n·β̂_p + κ_β·β_pool)/(n + κ_β). */
export interface ShrunkPortalBeta {
    readonly beta: number;
    /** Доля собственных данных w = n/(n + κ_β). */
    readonly w: number;
}

/** Норма ребра пула: μ_0k, κ̄_k и межпортальный разброс τ_0k. */
export interface PoolEdgeNorm {
    readonly edge: AiEdgeCode;
    readonly estimand: ParamEdgeEstimand;
    /** n-взвешенное среднее μ порталов. */
    readonly mu0: number;
    /** Среднее κ порталов в логарифмической шкале. */
    readonly kappaBar: number;
    /** SD logit/log μ по порталам; null — меньше двух порталов. */
    readonly tau0: number | null;
    /** Порталов, вошедших в ребро. */
    readonly portals: number;
}

/** Таблица F(d) пула: LagCdf плюс сама сетка — для снапшота и сверки. */
export interface PoolLagCdf extends LagCdf {
    readonly points: readonly LagCdfPoint[];
}

/** Статус пула: гейт «≥ pool_min_portals порталов» пройден или нет. */
export const AI_POOL_STATUSES = ['insufficient', 'estimated'] as const;
export type PoolStatus = (typeof AI_POOL_STATUSES)[number];

/** Почему портал вошёл или не вошёл в пул. */
export const AI_POOL_PORTAL_REASONS = {
    included: 'included',
    noConsent: 'no-consent',
    consentNotYet: 'consent-not-yet',
    shortHistory: 'short-history',
} as const;
export type PoolPortalReason =
    (typeof AI_POOL_PORTAL_REASONS)[keyof typeof AI_POOL_PORTAL_REASONS];

/** Причины пропусков в результате пула. */
export const AI_POOL_REASONS = {
    tooFewPortals: 'too-few-portals',
    tooFewPortalsBeta: 'too-few-portals-beta',
    noLagData: 'no-lag-data',
    noLognormalData: 'no-lognormal-data',
    seasonNotEstimated: 'season-not-estimated',
} as const;
export type PoolReason = (typeof AI_POOL_REASONS)[keyof typeof AI_POOL_REASONS];

/** Вердикт по порталу — только обезличенный ключ. */
export interface PoolPortalVerdict {
    readonly portalKey: string;
    readonly included: boolean;
    readonly reason: PoolPortalReason;
}

/** Готовность пула к уровню E2 (план §4.10): β по ≥ pool_min_portals_beta. */
export interface PoolEvidence {
    /** Порталов с оценкой β среди вошедших в пул. */
    readonly betaPortals: number;
    /** `pool_min_portals_beta` — минимум для E2. */
    readonly minPortalsE2: number;
    readonly ready: boolean;
}

/** Результат сборки пула. */
export interface PoolModel {
    readonly status: PoolStatus;
    /** Дата сборки 'YYYY-MM-DD' — входной параметр, не часы. */
    readonly now: string;
    /** Порталов с согласием и историей. */
    readonly eligible: number;
    readonly reasons: readonly PoolReason[];
    readonly edges: readonly PoolEdgeNorm[];
    readonly beta: PoolBeta | null;
    readonly lagCdf: PoolLagCdf | null;
    readonly lognormal: PoolLognormal | null;
    readonly seasonIndex: readonly number[] | null;
    readonly evidence: PoolEvidence;
    readonly portals: readonly PoolPortalVerdict[];
}
