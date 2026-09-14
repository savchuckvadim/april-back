import { AI_ANALYTICS_DEFINITION_PARAMS } from './registry.definitions.const';
import { AI_ANALYTICS_DQ_PARAMS } from './registry.dq.const';
import { AI_ANALYTICS_EDGE_PARAMS } from './registry.edges.const';
import { AI_ANALYTICS_EXPOSURE_PARAMS } from './registry.exposure.const';
import { AI_ANALYTICS_FUNNEL_PARAMS } from './registry.funnel.const';
import { AI_ANALYTICS_NORM_PARAMS } from './registry.norms.const';
import { AI_ANALYTICS_PLAN_PARAMS } from './registry.plan.const';
import { AI_ANALYTICS_POLICY_PARAMS } from './registry.policy.const';
import { AI_ANALYTICS_POOL_PARAMS } from './registry.pool.const';
import { AI_ANALYTICS_QUALITY_PARAMS } from './registry.quality.const';
import { AI_ANALYTICS_STYLE_PARAMS } from './registry.style.const';
import { AI_ANALYTICS_THRESHOLD_PARAMS } from './registry.thresholds.const';
import { AI_ANALYTICS_TENURE_PARAMS } from './registry.tenure.const';
import type { ParamDescriptor, ParamPrimitive } from './registry.types';

/**
 * Реестр параметров расчёта AI-аналитики ОП — единый источник правды для
 * модели, снапшотов, DTO и блока «Как считаем» (план Фазы 2, §2; анкета,
 * раздел Ж — 84 кода, покрытие проверяет `registry.mapping.const.ts`).
 *
 * Правило классов: настройками бывают только решения людей, оценками —
 * только свойства данных; гибрид — настроенный прайор, вытесняемый данными
 * по весу w. Ручных норм нет ни в одном режиме.
 *
 * Дескрипторы разложены по темам в соседних файлах (нормы, стаж, воронка,
 * рёбра, пороги, определения, стиль, экспозиция, план, политики, качество,
 * гейты данных), чтобы ни один файл не рос больше 300 строк. Составные
 * значения анкеты расщеплены по правилу «один код реестра = один скаляр».
 */
export const AI_ANALYTICS_PARAMS = [
    ...AI_ANALYTICS_NORM_PARAMS,
    ...AI_ANALYTICS_TENURE_PARAMS,
    ...AI_ANALYTICS_FUNNEL_PARAMS,
    ...AI_ANALYTICS_EDGE_PARAMS,
    ...AI_ANALYTICS_THRESHOLD_PARAMS,
    ...AI_ANALYTICS_DEFINITION_PARAMS,
    ...AI_ANALYTICS_STYLE_PARAMS,
    ...AI_ANALYTICS_EXPOSURE_PARAMS,
    ...AI_ANALYTICS_PLAN_PARAMS,
    ...AI_ANALYTICS_POLICY_PARAMS,
    ...AI_ANALYTICS_POOL_PARAMS,
    ...AI_ANALYTICS_QUALITY_PARAMS,
    ...AI_ANALYTICS_DQ_PARAMS,
] as const satisfies readonly ParamDescriptor[];

/** Дескриптор реестра с литеральными типами кода и дефолта. */
export type AiAnalyticsParam = (typeof AI_ANALYTICS_PARAMS)[number];

/** Литеральный union кодов реестра — типизированный ключ `resolveParam`. */
export type AiAnalyticsParamCode = AiAnalyticsParam['code'];

/** Все коды реестра в порядке объявления. */
export const AI_ANALYTICS_PARAM_CODES: readonly AiAnalyticsParamCode[] =
    AI_ANALYTICS_PARAMS.map(descriptor => descriptor.code);

/** Глобальные дефолты реестра: код → значение нижнего слоя `resolve`. */
export const AI_ANALYTICS_PARAM_DEFAULTS: Readonly<
    Record<string, ParamPrimitive>
> = Object.fromEntries(
    AI_ANALYTICS_PARAMS.map(
        descriptor => [descriptor.code, descriptor.defaultValue] as const,
    ),
);

const PARAM_ENTRIES: readonly (readonly [string, ParamDescriptor])[] =
    AI_ANALYTICS_PARAMS.map(
        descriptor => [descriptor.code, descriptor] as const,
    );

const PARAM_BY_CODE: ReadonlyMap<string, ParamDescriptor> = new Map(
    PARAM_ENTRIES,
);

/**
 * Дескриптор по коду. Возвращает `undefined` вместо исключения: неизвестный
 * код невозможен на типах, а на границе (JSON настроек, миграция снапшота)
 * вызывающий код должен уметь мягко откатиться к дефолту.
 */
export function findParam(code: string): ParamDescriptor | undefined {
    return PARAM_BY_CODE.get(code);
}

/** Строка — код реестра (проверка на границе с JSON и снапшотами). */
export const isAiAnalyticsParamCode = (
    value: string,
): value is AiAnalyticsParamCode => PARAM_BY_CODE.has(value);
