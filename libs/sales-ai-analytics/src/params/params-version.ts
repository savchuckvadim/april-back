import { createHash } from 'node:crypto';
import { comparableFrom } from '../contracts/versions.types';
import { AI_ANALYTICS_PARAMS, findParam } from './registry.const';
import type { ParamDescriptor } from './registry.types';

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
 * Расчётно значимая часть дескриптора: то, от чего зависят числа модели.
 * Тексты («Как считаем», заголовки, единицы) в версию не входят — правка
 * описания не должна рвать сравнимость снапшотов.
 */
function descriptorFingerprint(descriptor: ParamDescriptor): JsonObject {
    return {
        code: descriptor.code,
        scope: descriptor.scope,
        source: descriptor.source,
        defaultValue: descriptor.defaultValue,
        range: descriptor.range ? [...descriptor.range] : null,
        breaksSeries: descriptor.breaksSeries,
        kind: descriptor.kind ?? null,
        enumValues: descriptor.enumValues ? [...descriptor.enumValues] : null,
        prior: descriptor.prior ?? null,
        estimand: descriptor.estimand ?? null,
        intervalKind: descriptor.intervalKind ?? null,
    };
}

/**
 * Версия состава реестра: sha256 канонического JSON расчётно значимых полей
 * дескрипторов, отсортированных по коду. Меняется при добавлении, удалении
 * или переименовании параметра и при смене дефолта, диапазона, словаря или
 * признака `breaksSeries` — то есть когда снапшоты перестают быть
 * сопоставимыми по составу или по значениям нижнего слоя.
 */
export function registryVersionOf(
    descriptors: readonly ParamDescriptor[],
): string {
    const fingerprints = [...descriptors]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(descriptorFingerprint);

    return sha256(canonicalJson(fingerprints));
}

/** Версия текущего реестра `AI_ANALYTICS_PARAMS`. */
export const REGISTRY_VERSION: string = registryVersionOf(AI_ANALYTICS_PARAMS);

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

/** Коды из списка, у которых по реестру стоит `breaksSeries`. */
export function breakingParamCodes(codes: readonly string[]): string[] {
    return codes.filter(code => findParam(code)?.breaksSeries === true);
}

/**
 * Новая граница сравнимой истории после смены параметров (план §2.4, §3):
 * сдвиг вперёд на дату сохранения `now` — только если среди изменённых
 * кодов есть хотя бы один с `breaksSeries` по реестру; иначе граница
 * остаётся прежней. Назад граница не едет никогда (`max`), неизвестные коды
 * ряд не рвут. Даты — 'YYYY-MM-DD' или строки версий с датой внутри.
 */
export function nextComparableFrom(
    prev: string,
    changedCodes: readonly string[],
    now: string,
): string {
    return breakingParamCodes(changedCodes).length > 0
        ? comparableFrom([prev, now])
        : prev;
}
