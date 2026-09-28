/**
 * Подписи для текстов руководителю (правило владельца: блок «Как считаем»,
 * предупреждения панели и ошибки сохранения настроек — простым русским,
 * без формул, символов и кодов).
 *
 * Уровни менеджера подписаны так же, как на фронте (`AI_LEVEL`), параметры
 * реестра — их `userTitle`, диапазон допустимых значений — словами
 * «допустимо от … до …». Названия типов звонков — `callTypeTitleOf`
 * (`model/dictionary-titles.util`), склонение — `model/ru-text.util`.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import { findParam } from '../params/registry.const';
import {
    AI_MANAGER_LEVELS,
    type AiManagerLevelCode,
} from '../params/registry.enums.const';
import type { ParamDescriptor } from '../params/registry.types';

/** Подписи уровней — те же, что показывает фронт (`AI_LEVEL`). */
export const AI_MANAGER_LEVEL_LABELS: Readonly<
    Record<AiManagerLevelCode, string>
> = {
    junior: 'Джун',
    middle: 'Мидл',
    senior: 'Сеньор',
};

const isManagerLevel = (value: string): value is AiManagerLevelCode =>
    (AI_MANAGER_LEVELS as readonly string[]).includes(value);

/** Подпись уровня по коду; чужой код возвращается как есть. */
export function managerLevelLabel(level: string): string {
    return isManagerLevel(level) ? AI_MANAGER_LEVEL_LABELS[level] : level;
}

/** Название параметра для руководителя: `userTitle`, иначе `title`. */
export function paramUserTitle(descriptor: ParamDescriptor): string {
    return descriptor.userTitle ?? descriptor.title;
}

/** Описание параметра для руководителя: `userDescription`, иначе `description`. */
export function paramUserDescription(descriptor: ParamDescriptor): string {
    return descriptor.userDescription ?? descriptor.description;
}

/** Название параметра по коду; неизвестный код — сам код. */
export function paramTitleByCode(code: string): string {
    const descriptor = findParam(code);
    return descriptor ? paramUserTitle(descriptor) : code;
}

/**
 * Число как есть, но с десятичной запятой: 0.25 → «0,25». В отличие от
 * `ruDecimal` знаков после запятой не фиксирует — границы диапазона
 * реестра нельзя округлять.
 */
export const ruNumber = (value: number): string =>
    String(value).replace('.', ',');

/** «допустимо от 5 до 500» — вместо интервала в скобках. */
export function allowedRangeWords(
    range: readonly [min: number, max: number],
): string {
    return `допустимо от ${ruNumber(range[0])} до ${ruNumber(range[1])}`;
}

/** Каким должно быть значение параметра — словами, без имён типов. */
export function expectedValueWords(descriptor: ParamDescriptor): string {
    switch (typeof descriptor.defaultValue) {
        case 'number':
            return 'нужно число';
        case 'boolean':
            return 'нужен флаг «да» или «нет»';
        default:
            return 'нужен текст';
    }
}
