import { findParam, type AiAnalyticsParamCode } from './registry.const';
import type {
    ParamContext,
    ParamDescriptor,
    ParamEvidence,
    ParamResolveSource,
    ResolvedParam,
} from './registry.types';
import {
    inParamRange,
    isParamPrimitive,
    validateParamValue,
} from './registry.validate';

/** Слои переопределения снизу вверх: менеджер → полоса стажа → портал. */
const PARAM_LAYERS = [
    { source: 'manager', key: 'manager' },
    { source: 'tenure', key: 'tenureBand' },
    { source: 'portal', key: 'portal' },
] as const satisfies readonly {
    source: ParamResolveSource;
    key: keyof ParamContext;
}[];

/** Первый слой снизу вверх, в котором код параметра вообще присутствует. */
function pickLayer(
    code: string,
    ctx: ParamContext,
): { source: ParamResolveSource; value: unknown } | undefined {
    for (const layer of PARAM_LAYERS) {
        const record = ctx[layer.key];
        if (record && Object.prototype.hasOwnProperty.call(record, code)) {
            return { source: layer.source, value: record[code] };
        }
    }

    return undefined;
}

/**
 * Настроенное значение: слой менеджера важнее полосы стажа, полоса важнее
 * портала, портал важнее глобального дефолта. Значение неверного типа, вне
 * диапазона или не из словаря не «проваливается» на слой ниже — берётся
 * дефолт реестра с причиной, иначе портал мог бы молча испортить норму
 * опечаткой. Правила проверки — `validateParamValue` (registry.validate).
 */
function resolveConfigured(
    descriptor: ParamDescriptor,
    ctx: ParamContext,
): ResolvedParam {
    const fallback: ResolvedParam = {
        code: descriptor.code,
        value: descriptor.defaultValue,
        source: 'default',
    };
    const layer = pickLayer(descriptor.code, ctx);
    if (!layer) {
        return fallback;
    }
    if (!isParamPrimitive(layer.value)) {
        return { ...fallback, reason: 'type-mismatch' };
    }
    const reason = validateParamValue(descriptor, layer.value);
    if (reason !== undefined) {
        return { ...fallback, reason };
    }

    return { code: descriptor.code, value: layer.value, source: layer.source };
}

/**
 * Смесь гибрида: `value = w·data + (1 − w)·prior`, где prior — настроенное
 * значение слоя, а data и вес w приходят из расчёта (обычно w = n/(n + κ)).
 * Оценка вне диапазона реестра игнорируется — остаётся настроенный прайор.
 */
function mixHybrid(
    descriptor: ParamDescriptor,
    configured: ResolvedParam,
    evidence: ParamEvidence,
): ResolvedParam {
    const { data, w, n } = evidence;
    const prior = configured.value;
    if (
        descriptor.source !== 'hybrid' ||
        typeof prior !== 'number' ||
        typeof data !== 'number' ||
        typeof w !== 'number' ||
        !Number.isFinite(data) ||
        !Number.isFinite(w) ||
        w < 0 ||
        w > 1
    ) {
        return configured;
    }
    if (!inParamRange(data, descriptor.range)) {
        return { ...configured, reason: 'out-of-range' };
    }

    return {
        code: descriptor.code,
        value: w * data + (1 - w) * prior,
        source: 'hybrid',
        prior,
        data,
        w,
        ...(typeof n === 'number' ? { n } : {}),
    };
}

/**
 * Значение параметра для контекста: менеджер → полоса стажа → портал →
 * глобальный дефолт, для гибридов — смесь настройки и данных по весу w.
 * Исключений не бросает: неизвестный код (возможен только на границе с
 * JSON) отдаёт reason: 'unknown-code'.
 */
export function resolveParam(
    code: AiAnalyticsParamCode,
    ctx: ParamContext = {},
    evidence: ParamEvidence = {},
): ResolvedParam {
    const descriptor = findParam(code);
    if (!descriptor) {
        return { code, value: 0, source: 'default', reason: 'unknown-code' };
    }

    return mixHybrid(descriptor, resolveConfigured(descriptor, ctx), evidence);
}

/**
 * Числовое значение параметра для расчётов. Для строковых и флаговых кодов
 * возвращает undefined — вызывающий код обязан обработать это явно.
 */
export function resolveNumberParam(
    code: AiAnalyticsParamCode,
    ctx: ParamContext = {},
    evidence: ParamEvidence = {},
): number | undefined {
    const resolved = resolveParam(code, ctx, evidence);

    return typeof resolved.value === 'number' ? resolved.value : undefined;
}
