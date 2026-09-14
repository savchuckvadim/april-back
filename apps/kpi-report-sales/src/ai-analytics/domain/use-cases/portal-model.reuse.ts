/**
 * Идемпотентность и переиспользование месячной модели портала (план
 * Фазы 2, поток 16a; штатная деградация §5.4).
 *
 * Два правила, ради которых файл отделён от сценария (лимит 300 строк):
 * повтор прогона за тот же месяц на тех же настройках НЕ переписывает
 * запись (иначе конвейер плодил бы `superseded` каждую ночь), а окно без
 * данных переиспользует прошлую модель с явной пометкой — витрина
 * остаётся с нормами, но руководитель видит, что они не сегодняшние.
 *
 * Чистые функции: без DI и без `new Date()` внутри.
 */
import { medianOf } from '@lib/sales-ai-analytics';
import { AI_PORTAL_MODEL_REASONS } from '../../constants/ai-portal-model.const';
import type { AiSnapshotMeta } from '../assembler/manager-snapshot.types';
import type {
    PortalManagerMonth,
    PortalModelPayload,
    PortalModelRequest,
    PortalModelResult,
} from '../assembler/portal-model.types';
import type { PortalModelRecord } from '../loaders/portal-model.loader';

/** Медиана среднего чека месяца — прокси «медианы цены» для журнала. */
export function priceMedianOf(
    months: readonly PortalManagerMonth[],
    monthKey: string,
): number | null {
    const checks = months
        .filter(month => month.monthKey === monthKey)
        .flatMap(month => month.averageCheck ?? []);

    return checks.length === 0 ? null : medianOf(checks);
}

/**
 * Последняя запись — ровно то, что прогон записал бы сейчас: тот же месяц
 * и та же версия параметров, а дальше по виду записи. Посчитанная модель
 * совпадает, когда в окне тот же объём наблюдений; деградация (`reused`)
 * — когда окно по-прежнему пусто и причина та же (аудит M4: раньше копия
 * прошлой модели писалась каждый прогон). В обоих случаях запись не
 * переписывается — `written: 0`, `superseded` не плодится (идемпотентность
 * шага, контракт конвейера); `forceRefresh` этот путь обходит.
 */
export function freshResult(
    previous: PortalModelRecord | null,
    request: PortalModelRequest,
    paramsVersion: string,
    months: readonly PortalManagerMonth[],
): PortalModelResult | null {
    const payload = previous?.payload;
    if (
        request.forceRefresh === true ||
        previous === null ||
        payload === undefined ||
        previous.monthKey !== request.monthKey ||
        payload.meta?.paramsVersion !== paramsVersion
    ) {
        return null;
    }
    const reused = payload.reused === true;
    const observations = months.filter(month => !month.excludeFromNorms).length;
    const same = reused
        ? months.length === 0 &&
          payload.reusedReason === AI_PORTAL_MODEL_REASONS.monthsMissing
        : months.length > 0 && payload.observations === observations;
    if (!same) {
        return null;
    }

    return {
        id: previous.id,
        payload: payload as PortalModelPayload,
        reused,
        reason: reused ? AI_PORTAL_MODEL_REASONS.reusedPrevious : null,
        months: months.length,
        written: 0,
    };
}

/**
 * Прошлая модель под ключом нового месяца. null — переиспользовать
 * нечего: записи не будет вовсе, а шаг уйдёт в журнал «частично».
 */
export function reusedPayload(
    previous: PortalModelRecord | null,
    monthKey: string,
    meta: AiSnapshotMeta,
): PortalModelPayload | null {
    const source = previous?.payload;
    if (!source || !Array.isArray(source.edges)) {
        return null;
    }

    return {
        ...(source as PortalModelPayload),
        monthKey,
        reused: true,
        reusedReason: AI_PORTAL_MODEL_REASONS.monthsMissing,
        meta,
    };
}

/** Итог «данных нет и прошлой модели нет»: запись не создаётся. */
export const NO_MODEL_RESULT: PortalModelResult = {
    id: null,
    payload: null,
    reused: false,
    reason: AI_PORTAL_MODEL_REASONS.monthsMissing,
    months: 0,
    written: 0,
};
