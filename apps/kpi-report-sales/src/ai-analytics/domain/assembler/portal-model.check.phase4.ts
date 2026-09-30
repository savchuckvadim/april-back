/**
 * Логнормальный чек модели портала Фазы 4 (план §4.8): оценка с усадкой
 * к прайору и собственная несжатая оценка для пула. Вынесено из
 * `portal-model.estimates.phase4.ts` по лимиту 300 строк.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    CHECK_LOGNORMAL_M_CODE,
    CHECK_LOGNORMAL_V_CODE,
    estimateLognormalCheck,
    LOGNORMAL_CHECK_DEFAULTS,
    resolveNumberParam,
    resolveParam,
    type ParamContext,
    type PoolSnapshot,
} from '@lib/sales-ai-analytics';
import { usablePool } from './portal-model.estimates.phase4';
import type { PortalCheckLognormalFacts } from './portal-model.phase4.types';
import type { PortalManagerMonth } from './portal-model.types';

/**
 * Логнормальный чек (план §4.8). Сумм по сделкам в месячных снапшотах
 * нет, поэтому основа — средний чек менеджер-месяца (сумма продаж /
 * число продаж), повторённый по числу продаж: среднее `m` честное, а
 * разброс `v` занижен (внутримесячный разброс сделок теряется).
 *
 * Прайор усадки: явное переопределение портала `check_lognormal_m/v` →
 * чек пула → дефолт реестра. Собственная несжатая оценка (`own`) пишется
 * отдельно — её и усредняет пул.
 */
export function checkPhase4Of(
    months: readonly PortalManagerMonth[],
    pool: PoolSnapshot | null | undefined,
    registry: ParamContext,
): PortalCheckLognormalFacts {
    const amounts = months.flatMap(month => {
        const count = Math.max(0, Math.round(month.salesCount));
        const check = month.averageCheck;

        return check !== null && check > 0 && count > 0
            ? Array.from({ length: count }, () => check)
            : [];
    });
    const prior = checkPriorOf(pool, registry);
    const result = estimateLognormalCheck(amounts, {
        priorM: prior.m,
        priorV: prior.v,
    });
    const own =
        result.source === 'default'
            ? null
            : estimateLognormalCheck(amounts, { kappa: 0 });

    return {
        m: result.m,
        v: result.v,
        n: result.n,
        w: result.w,
        source: result.source,
        priorFromPool: prior.fromPool,
        own: own === null ? null : { m: own.m, v: own.v, n: own.n },
    };
}

/** Параметр задан порталом явно (не дефолт реестра). */
const overridden = (
    code: typeof CHECK_LOGNORMAL_M_CODE | typeof CHECK_LOGNORMAL_V_CODE,
    registry: ParamContext,
): boolean => resolveParam(code, registry).source !== 'default';

/**
 * Прайор чека: переопределение портала сильнее пула (настройку делал
 * человек), пул — сильнее дефолта реестра.
 */
function checkPriorOf(
    pool: PoolSnapshot | null | undefined,
    registry: ParamContext,
): { m: number; v: number; fromPool: boolean } {
    const fromRegistry = {
        m:
            resolveNumberParam(CHECK_LOGNORMAL_M_CODE, registry) ??
            LOGNORMAL_CHECK_DEFAULTS.priorM,
        v:
            resolveNumberParam(CHECK_LOGNORMAL_V_CODE, registry) ??
            LOGNORMAL_CHECK_DEFAULTS.priorV,
    };
    const pooled = usablePool(pool)?.lognormal ?? null;
    if (
        pooled === null ||
        overridden(CHECK_LOGNORMAL_M_CODE, registry) ||
        overridden(CHECK_LOGNORMAL_V_CODE, registry)
    ) {
        return { ...fromRegistry, fromPool: false };
    }

    return { m: pooled.m, v: pooled.v, fromPool: true };
}
