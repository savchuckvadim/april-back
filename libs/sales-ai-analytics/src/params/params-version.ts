import { createHash } from 'node:crypto';
import { AI_ANALYTICS_PARAM_CODES } from './registry.const';

/** Примитив канонического JSON. */
export type JsonPrimitive = string | number | boolean | null;

/** Массив канонического JSON. */
export type JsonArray = readonly JsonValue[];

/** Объект канонического JSON. */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** Значение канонического JSON — без `any` и без undefined. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

const isJsonArray = (value: JsonValue): value is JsonArray =>
    Array.isArray(value);

const sha256 = (input: string): string =>
    createHash('sha256').update(input, 'utf8').digest('hex');

/**
 * Канонический JSON: ключи объектов отсортированы, порядок массивов
 * сохраняется, не-конечные числа и −0 нормализованы. Нужен для того, чтобы
 * хэш версии параметров не зависел от порядка ключей в настройках портала.
 */
export function canonicalJson(value: JsonValue): string {
    if (value === null) {
        return 'null';
    }
    if (isJsonArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (typeof value === 'object') {
        const body = Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
            .join(',');

        return `{${body}}`;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return 'null';
        }

        return JSON.stringify(value === 0 ? 0 : value);
    }

    return JSON.stringify(value);
}

/**
 * Версия состава реестра: sha256 отсортированного списка кодов. Меняется
 * при добавлении, удалении или переименовании параметра — то есть когда
 * снапшоты перестают быть сопоставимыми по составу.
 */
export const REGISTRY_VERSION: string = sha256(
    canonicalJson([...AI_ANALYTICS_PARAM_CODES].sort()),
);

/** Эффективные настройки слоёв для расчёта версии параметров. */
export interface ParamsVersionPayload {
    /** Глобальные дефолты реестра (код → значение). */
    readonly globalDefaults?: JsonObject;
    /** Переопределения портала. */
    readonly portalParams?: JsonObject;
    /** Переопределения полос стажа. */
    readonly tenureParams?: JsonObject;
    /** Переопределения менеджеров. */
    readonly managerParams?: JsonObject;
    /** Версия состава реестра; по умолчанию REGISTRY_VERSION. */
    readonly registryVersion?: string;
}

/**
 * `paramsVersion` снапшота и DTO: sha256 канонического JSON эффективных
 * настроек всех слоёв вместе с версией состава реестра. Детерминирован —
 * два вызова на одинаковом входе с разным порядком ключей дают один хэш;
 * любое изменение значения меняет хэш и рвёт сравнимость рядов.
 */
export function paramsVersion(payload: ParamsVersionPayload): string {
    return sha256(
        canonicalJson({
            globalDefaults: payload.globalDefaults ?? {},
            portalParams: payload.portalParams ?? {},
            tenureParams: payload.tenureParams ?? {},
            managerParams: payload.managerParams ?? {},
            registryVersion: payload.registryVersion ?? REGISTRY_VERSION,
        }),
    );
}
