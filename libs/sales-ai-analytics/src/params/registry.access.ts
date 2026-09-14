/**
 * Типизированный доступ библиотеки к реестру: дефолт, диапазон и проверка
 * значения по коду. Нужен, чтобы `*_DEFAULTS` модели (`lag-cdf.ts`,
 * `readiness.ts`, `capacity.ts` …) брали числа из реестра, а не дублировали
 * их литералами — реестр остаётся единственным источником величин.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    findParam,
    type AiAnalyticsParam,
    type AiAnalyticsParamCode,
} from './registry.const';
import { validateParamValue } from './registry.validate';
import type {
    ParamPrimitive,
    ParamRange,
    ParamResolveReason,
} from './registry.types';

/** Литерал дефолта → его примитивный тип (0.85 → number, false → boolean). */
type Widen<T> = T extends number
    ? number
    : T extends string
      ? string
      : T extends boolean
        ? boolean
        : never;

/**
 * Дескрипторы, чей код накрывает `C`. Для порождённых генератором кодов
 * (`mu_e1`, `e2_rate`, `cap_cold`) код дескриптора — union шаблона, поэтому
 * сравнение идёт «C входит в код», а не «код равен C».
 */
type ParamsWithCode<P, C extends string> = P extends {
    readonly code: infer K extends string;
}
    ? C extends K
        ? P
        : never
    : never;

/** Тип дефолта кода реестра: `AiAnalyticsParamDefault<'f_min'>` = number. */
export type AiAnalyticsParamDefault<C extends AiAnalyticsParamCode> = Widen<
    ParamsWithCode<AiAnalyticsParam, C>['defaultValue']
>;

/**
 * Глобальный дефолт кода реестра. Для типизированного кода тип значения
 * выводится из дескриптора; для строки с границы (JSON, снапшот) нужен
 * запасной вариант того же типа — он же возвращается при чужом типе.
 */
export function registryDefault<C extends AiAnalyticsParamCode>(
    code: C,
): AiAnalyticsParamDefault<C>;
export function registryDefault<T extends ParamPrimitive>(
    code: string,
    fallback: T,
): T;
export function registryDefault(
    code: string,
    fallback?: ParamPrimitive,
): ParamPrimitive {
    const value = findParam(code)?.defaultValue;
    if (fallback === undefined) {
        if (value === undefined) {
            throw new Error(`Код реестра параметров не найден: ${code}`);
        }

        return value;
    }

    return value !== undefined && typeof value === typeof fallback
        ? value
        : fallback;
}

/** Диапазон числового кода реестра; без диапазона или кода — undefined. */
export function registryRangeOf(code: string): ParamRange | undefined {
    return findParam(code)?.range;
}

/**
 * Почему значение не подходит коду реестра (`unknown-code`, если кода нет);
 * `undefined` — подходит. Единый валидатор для слоёв настроек и модели.
 */
export function registryValueReason(
    code: string,
    value: unknown,
): ParamResolveReason | undefined {
    const descriptor = findParam(code);

    return descriptor ? validateParamValue(descriptor, value) : 'unknown-code';
}

/** Значение подходит коду реестра по типу, диапазону и словарю. */
export const isRegistryValue = (code: string, value: unknown): boolean =>
    registryValueReason(code, value) === undefined;
