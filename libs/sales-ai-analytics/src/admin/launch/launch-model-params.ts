/**
 * JSON переопределений модели портала (`ai_analytics_model_params`) для
 * кнопки «Показать прогноз в отчёте»: строгий разбор (битый JSON — ошибка
 * с понятным текстом, а не молчаливое «{}», иначе сохранение затёрло бы
 * чужие ключи) и мёрж ТОЛЬКО флагов ступеней — остальные ключи как были.
 * Чистые функции: без Nest и БД.
 */
import { LAUNCH_STAGE_FLAG_PARAMS } from './launch.const';

/** Объект переопределений либо текст, почему JSON не принят. */
export type ModelParamsParse =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };

export const MODEL_PARAMS_MESSAGES = {
    notString:
        'Настройка ai_analytics_model_params портала хранится не строкой JSON — ' +
        'исправьте её в карточке портала (Настройки приложений → «Модель и ' +
        'данные»). Флаги не сохранены.',
    invalid:
        'JSON ai_analytics_model_params портала не разбирается — исправьте его ' +
        'в карточке портала (Настройки приложений → «Модель и данные»). Флаги ' +
        'не сохранены. Ошибка разбора:',
    notObject:
        'В ai_analytics_model_params портала лежит не объект {"код": значение} — ' +
        'исправьте его в карточке портала (Настройки приложений → «Модель и ' +
        'данные»). Флаги не сохранены.',
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Строгий разбор: пусто — {}, битый JSON или не объект — ошибка. */
export function parseModelParamsJson(raw: unknown): ModelParamsParse {
    if (raw === undefined || raw === null) return { ok: true, value: {} };
    if (typeof raw !== 'string') {
        return { ok: false, error: MODEL_PARAMS_MESSAGES.notString };
    }
    const text = raw.trim();
    if (text === '') return { ok: true, value: {} };
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return {
            ok: false,
            error: `${MODEL_PARAMS_MESSAGES.invalid} ${(error as Error).message}`,
        };
    }
    if (!isPlainObject(parsed)) {
        return { ok: false, error: MODEL_PARAMS_MESSAGES.notObject };
    }
    return { ok: true, value: parsed };
}

/** Какие флаги ступеней поменять; не заданный — не трогается. */
export interface StageFlagsPatch {
    forecast?: boolean;
    recommendations?: boolean;
}

export interface StageFlagsMerge {
    merged: Record<string, unknown>;
    /** Коды флагов, чьё значение действительно поменялось. */
    changed: string[];
}

/** Мёрж флагов поверх текущих переопределений; прочие ключи как были. */
export function mergeStageFlags(
    current: Readonly<Record<string, unknown>>,
    patch: StageFlagsPatch,
): StageFlagsMerge {
    const flags: Record<string, boolean> = {};
    if (patch.forecast !== undefined) {
        flags[LAUNCH_STAGE_FLAG_PARAMS.forecast] = patch.forecast;
    }
    if (patch.recommendations !== undefined) {
        flags[LAUNCH_STAGE_FLAG_PARAMS.recommendations] = patch.recommendations;
    }
    const changed = Object.keys(flags).filter(
        code => current[code] !== flags[code],
    );
    return { merged: { ...current, ...flags }, changed };
}

/** Флаг включён только явным true (как читает реестр параметров). */
export function stageFlagOf(
    params: Readonly<Record<string, unknown>>,
    code: string,
): boolean {
    return params[code] === true;
}
