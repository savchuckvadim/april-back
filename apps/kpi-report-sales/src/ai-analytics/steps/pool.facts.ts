/**
 * Чистые куски шага «пул порталов» (Фаза 4, П17/П22): параметры пула из
 * реестра портала, вердикт «портал — участник пула», перевод модели пула
 * библиотеки в нагрузку снапшота (таблица `F(d)` без функции `at`) и
 * сигнатура входов для идемпотентной записи.
 *
 * Отделено от `pool.step.ts` по образцу `stage-history.facts.ts`: шаг
 * оркеструет, чистые преобразования — здесь.
 */
import {
    AI_POOL_PORTAL_REASONS,
    resolveNumberParam,
    type AiSnapshotMeta,
    type ParamContext,
    type PoolModel,
    type PoolParams,
    type PoolPortalReason,
    type PoolSnapshot,
} from '@lib/sales-ai-analytics';
import { contentInputsHashOf } from '../store/snapshot-serialize.util';

/** Вердикты «согласия нет»: такой портал пул не получает. */
const NO_CONSENT_REASONS: readonly PoolPortalReason[] = [
    AI_POOL_PORTAL_REASONS.noConsent,
    AI_POOL_PORTAL_REASONS.consentNotYet,
];

/**
 * Гейты пула из реестра: `pool_min_portals` (он же минимум порталов для
 * β пула — как дефолт библиотеки) и `pool_min_history_months`.
 */
export function poolParamsOf(registry: ParamContext): Partial<PoolParams> {
    const minPortals = resolveNumberParam('pool_min_portals', registry);
    const minHistoryMonths = resolveNumberParam(
        'pool_min_history_months',
        registry,
    );

    return {
        ...(minPortals === undefined
            ? {}
            : { minPortals, minPortalsBeta: minPortals }),
        ...(minHistoryMonths === undefined ? {} : { minHistoryMonths }),
    };
}

/**
 * Портал получает пул, если он есть среди входов и его согласие уже в
 * силе. Короткая история участию не мешает: такой портал в оценку пула
 * не входит, но пул получает — ему он нужнее всех.
 */
export function receivesPool(pool: PoolModel, selfKey: string): boolean {
    const verdict = pool.portals.find(item => item.portalKey === selfKey);

    return (
        verdict !== undefined && !NO_CONSENT_REASONS.includes(verdict.reason)
    );
}

/** Модель пула → нагрузка снапшота `ai-analytics-pool` текущего портала. */
export function poolSnapshotOf(
    pool: PoolModel,
    input: {
        readonly monthKey: string;
        readonly selfKey: string;
        readonly meta: AiSnapshotMeta;
    },
): PoolSnapshot {
    return {
        monthKey: input.monthKey,
        status: pool.status,
        reasons: pool.reasons,
        eligible: pool.eligible,
        edges: pool.edges,
        beta: pool.beta,
        lagCdf:
            pool.lagCdf === null
                ? null
                : {
                      kind: pool.lagCdf.kind,
                      medianDays: pool.lagCdf.medianDays,
                      n: pool.lagCdf.n,
                      points: pool.lagCdf.points,
                  },
        lognormal: pool.lognormal,
        seasonIndex: pool.seasonIndex,
        evidence: pool.evidence,
        portals: pool.portals,
        selfKey: input.selfKey,
        meta: input.meta,
    };
}

/**
 * Сигнатура записи пула: хэш прогона портала плюс содержимое пула. Модели
 * других порталов в хэш прогона не входят, поэтому без содержимого повтор
 * того же дня не увидел бы, что пул изменился.
 */
export function poolInputsHashOf(
    runInputsHash: string,
    payload: PoolSnapshot,
): string {
    return contentInputsHashOf(runInputsHash, payload);
}
