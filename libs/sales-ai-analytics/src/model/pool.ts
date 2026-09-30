/**
 * Сборка пула порталов (план §4.4 «Пул», §4.11 «Ежеквартально»: ≥
 * `pool_min_portals` порталов с датированным согласием и историей ≥
 * `pool_min_history_months`). Режим владельца А.3: без согласия портал в
 * пул не входит; в результате — только обезличенные ключи.
 *
 * Гейты: статус `insufficient` — ни одного числа наружу; β пула — при
 * ≥ minPortalsBeta порталов с β (по умолчанию `pool_min_portals`), а
 * уровень E2 (§4.10) требует отдельно ≥ `pool_min_portals_beta` — это
 * отражено в `evidence`. Чистая математика без DI, Bitrix, Prisma и часов:
 * дата `now` — параметр.
 */
import { registryDefault } from '../params/registry.access';
import { isUsablePortalBeta, poolBeta } from './pool-beta';
import { poolLagCdf, poolLognormal, poolSeasonIndex } from './pool-lag';
import { poolEdgeNorms } from './pool-norms';
import {
    AI_POOL_PORTAL_REASONS,
    AI_POOL_REASONS,
    type PoolEvidence,
    type PoolModel,
    type PoolPortalInput,
    type PoolPortalReason,
    type PoolPortalVerdict,
    type PoolReason,
} from './pool.types';

/** Параметры гейтов пула. */
export interface PoolParams {
    /** Минимум порталов для статуса `estimated`. */
    readonly minPortals: number;
    /** Минимум месяцев истории портала. */
    readonly minHistoryMonths: number;
    /** Минимум порталов с β для оценки β пула. */
    readonly minPortalsBeta: number;
}

/** Дефолты гейтов пула — из реестра. */
export const POOL_DEFAULTS = {
    /** `pool_min_portals`. */
    minPortals: registryDefault('pool_min_portals'),
    /** `pool_min_history_months`. */
    minHistoryMonths: registryDefault('pool_min_history_months'),
    /**
     * Минимум порталов с β для β пула — тот же `pool_min_portals` (3);
     * E2 требует строже: `pool_min_portals_beta` (см. `evidence`).
     */
    minPortalsBeta: registryDefault('pool_min_portals'),
    /** `pool_min_portals_beta` — гейт уровня E2. */
    minPortalsE2: registryDefault('pool_min_portals_beta'),
} as const satisfies PoolParams & { readonly minPortalsE2: number };

export interface BuildPoolInput {
    readonly portals: readonly PoolPortalInput[];
    /** Дата сборки 'YYYY-MM-DD'. */
    readonly now: string;
    readonly params?: Partial<PoolParams>;
}

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Дата вида 'YYYY-MM-DD' — строки такого вида сравнимы лексикографически. */
export const isIsoDate = (value: string): boolean => ISO_DATE_RE.test(value);

/**
 * Почему портал (не) входит в пул: согласие датировано и не позже `now`,
 * истории не меньше minHistoryMonths. Дата в неверном формате считается
 * отсутствием согласия.
 */
export function portalPoolReason(
    portal: PoolPortalInput,
    now: string,
    minHistoryMonths: number,
): PoolPortalReason {
    if (portal.consentAt === null || !isIsoDate(portal.consentAt)) {
        return AI_POOL_PORTAL_REASONS.noConsent;
    }
    if (portal.consentAt > now) {
        return AI_POOL_PORTAL_REASONS.consentNotYet;
    }
    if (!(portal.historyMonths >= minHistoryMonths)) {
        return AI_POOL_PORTAL_REASONS.shortHistory;
    }

    return AI_POOL_PORTAL_REASONS.included;
}

function resolveParams(overrides: Partial<PoolParams> | undefined): PoolParams {
    return {
        minPortals: overrides?.minPortals ?? POOL_DEFAULTS.minPortals,
        minHistoryMonths:
            overrides?.minHistoryMonths ?? POOL_DEFAULTS.minHistoryMonths,
        minPortalsBeta:
            overrides?.minPortalsBeta ?? POOL_DEFAULTS.minPortalsBeta,
    };
}

/** Гейт E2: β пула оценена и порталов с β не меньше `pool_min_portals_beta`. */
function evidenceOf(betaPortals: number, hasBeta: boolean): PoolEvidence {
    return {
        betaPortals,
        minPortalsE2: POOL_DEFAULTS.minPortalsE2,
        ready: hasBeta && betaPortals >= POOL_DEFAULTS.minPortalsE2,
    };
}

function insufficient(
    now: string,
    verdicts: readonly PoolPortalVerdict[],
    eligible: number,
): PoolModel {
    return {
        status: 'insufficient',
        now,
        eligible,
        reasons: [AI_POOL_REASONS.tooFewPortals],
        edges: [],
        beta: null,
        lagCdf: null,
        lognormal: null,
        seasonIndex: null,
        evidence: evidenceOf(0, false),
        portals: verdicts,
    };
}

/**
 * Пул порталов: отбор по согласию и истории, затем нормы рёбер (только
 * рёбра с ≥ minPortals порталов), β пула, F(d), логнормальный чек и сезон
 * (F(d), чек и сезон — тоже только при ≥ minPortals порталов с данными).
 * Меньше minPortals пригодных порталов → `insufficient` без чисел.
 * Дата `now` не вида 'YYYY-MM-DD' — ошибка вызывающего кода.
 */
export function buildPool(input: BuildPoolInput): PoolModel {
    if (!isIsoDate(input.now)) {
        throw new Error(`Дата сборки пула не вида YYYY-MM-DD: ${input.now}`);
    }
    const params = resolveParams(input.params);
    const verdicts: PoolPortalVerdict[] = input.portals.map(portal => {
        const reason = portalPoolReason(
            portal,
            input.now,
            params.minHistoryMonths,
        );

        return {
            portalKey: portal.portalKey,
            included: reason === AI_POOL_PORTAL_REASONS.included,
            reason,
        };
    });
    const eligible = input.portals.filter(
        (_, index) => verdicts[index].included,
    );
    if (eligible.length < Math.max(1, params.minPortals)) {
        return insufficient(input.now, verdicts, eligible.length);
    }

    const reasons: PoolReason[] = [];
    const betas = eligible
        .flatMap(portal => (portal.beta === null ? [] : [portal.beta]))
        .filter(isUsablePortalBeta);
    const beta =
        betas.length >= params.minPortalsBeta
            ? poolBeta({ portals: betas })
            : null;
    if (beta === null) {
        reasons.push(AI_POOL_REASONS.tooFewPortalsBeta);
    }
    const lagCdf = poolLagCdf(eligible, {
        minPortals: params.minPortals,
    });
    if (lagCdf === null) {
        reasons.push(AI_POOL_REASONS.noLagData);
    }
    const lognormal = poolLognormal(eligible, params.minPortals);
    if (lognormal === null) {
        reasons.push(AI_POOL_REASONS.noLognormalData);
    }
    const seasonIndex = poolSeasonIndex(eligible, params.minPortals);
    if (seasonIndex === null) {
        reasons.push(AI_POOL_REASONS.seasonNotEstimated);
    }

    return {
        status: 'estimated',
        now: input.now,
        eligible: eligible.length,
        reasons,
        edges: poolEdgeNorms(eligible).filter(
            edge => edge.portals >= params.minPortals,
        ),
        beta,
        lagCdf,
        lognormal,
        seasonIndex,
        evidence: evidenceOf(betas.length, beta !== null),
        portals: verdicts,
    };
}
