import { AI_ANALYTICS_DEFINITION_PARAMS } from './registry.definitions.const';
import { AI_ANALYTICS_FUNNEL_PARAMS } from './registry.funnel.const';
import { AI_ANALYTICS_NORM_PARAMS } from './registry.norms.const';
import { AI_ANALYTICS_STYLE_PARAMS } from './registry.style.const';
import { AI_ANALYTICS_THRESHOLD_PARAMS } from './registry.thresholds.const';
import { AI_ANALYTICS_TENURE_PARAMS } from './registry.tenure.const';
import type { ParamDescriptor, ParamPrimitive } from './registry.types';

/**
 * Реестр параметров расчёта AI-аналитики ОП — единый источник правды для
 * модели, снапшотов, DTO и блока «Как считаем» (план `ai-sales-analytics`,
 * раздел 4.1; анкета, раздел Ж).
 *
 * Правило классов: настройками бывают только решения людей, оценками —
 * только свойства данных; гибрид — настроенный прайор, вытесняемый данными
 * по весу w. Ручных норм нет ни в одном режиме.
 *
 * Дескрипторы разложены по темам в соседних файлах (нормы, стаж, воронка,
 * пороги, определения, стиль), чтобы ни один файл не рос больше 300 строк.
 */
export const AI_ANALYTICS_PARAMS = [
    ...AI_ANALYTICS_NORM_PARAMS,
    ...AI_ANALYTICS_TENURE_PARAMS,
    ...AI_ANALYTICS_FUNNEL_PARAMS,
    ...AI_ANALYTICS_THRESHOLD_PARAMS,
    ...AI_ANALYTICS_DEFINITION_PARAMS,
    ...AI_ANALYTICS_STYLE_PARAMS,
] as const satisfies readonly ParamDescriptor[];

/** Литеральный union кодов реестра — типизированный ключ `resolveParam`. */
export type AiAnalyticsParamCode = (typeof AI_ANALYTICS_PARAMS)[number]['code'];

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
