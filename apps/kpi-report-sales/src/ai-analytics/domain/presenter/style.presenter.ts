/**
 * Профиль стиля строки менеджера (документ `ai-analytics-manager-style.md`,
 * поток 16b): снапшот `ai-analytics-style` → `AiStyleProfileDto`.
 *
 * Стиль — это КАК человек работает, а не насколько хорошо: рейтинга по
 * осям нет, каждая подпись идёт с опорой в числах. Правила подписей,
 * усадку и гистерезис считает библиотека на месячном шаге — витрина
 * только переводит готовый профиль и молчит, когда данных мало:
 * меньше `style_min_calls` (40) разборов или доверие `none` → `null`.
 *
 * Чистые функции.
 */
import { STYLE_PROFILE_DEFAULTS } from '@lib/sales-ai-analytics';
import {
    AiStyleProfileDto,
    AiStyleTagDto,
} from '../../dto/ai-style-profile.dto';
import type { StyleView } from '../assembler/overview-model.types';

export type { StyleView };

/** Опции показа: пороги профиля (по умолчанию — дефолты библиотеки). */
export interface StyleProfileOptions {
    /** `style_min_calls` — ниже профиль не показывается. */
    minCalls?: number;
    /** Сколько подписей отдаём (не больше, чем выдала библиотека). */
    maxTags?: number;
}

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** Подписи профиля; чужая или неполная форма записи отбрасывается. */
function tagsOf(value: unknown, max: number): AiStyleTagDto[] {
    const list = Array.isArray(value) ? value : [];

    return list
        .flatMap((item): AiStyleTagDto[] => {
            const tag = (item ?? {}) as Record<string, unknown>;
            if (typeof tag.code !== 'string' || typeof tag.title !== 'string') {
                return [];
            }
            return [
                {
                    code: tag.code,
                    title: tag.title,
                    basis: typeof tag.basis === 'string' ? tag.basis : '',
                    n: isNumber(tag.n) ? tag.n : 0,
                },
            ];
        })
        .slice(0, Math.max(0, max));
}

/** Вектор осей: только числовые значения (пустой при доверии none). */
function vectorOf(value: unknown): Record<string, number> {
    if (value === null || typeof value !== 'object') {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, number] => isNumber(entry[1]),
        ),
    );
}

/**
 * Профиль стиля для строки обзора; `null` — снапшота нет, доверие `none`
 * либо разборов меньше `style_min_calls`. Подписей не больше, чем
 * разрешает библиотека (`style_max_tags`, по умолчанию три).
 */
export function toStyleProfile(
    style: StyleView | null | undefined,
    options: StyleProfileOptions = {},
): AiStyleProfileDto | null {
    if (!style) {
        return null;
    }
    const minCalls = options.minCalls ?? STYLE_PROFILE_DEFAULTS.minCalls;
    const calls = isNumber(style.calls) ? style.calls : 0;
    const confidence =
        typeof style.confidence === 'string' ? style.confidence : 'none';
    if (confidence === 'none' || calls < minCalls) {
        return null;
    }

    return {
        tags: tagsOf(
            style.tags,
            options.maxTags ?? STYLE_PROFILE_DEFAULTS.maxTags,
        ),
        vector: vectorOf(style.vector),
        confidence,
        calls,
    };
}
