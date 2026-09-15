/**
 * Карточка стиля: нагрузка снапшота `ai-analytics-style` → `AiStyleCardDto`
 * (документ `ai/tasks/ai-analytics-manager-style.md`, §1.3, §2.4, §4.1).
 *
 * Правила карточки, которые здесь и держатся:
 *  - подписи показываются только вместе с опорой в числах и объёмом;
 *  - оспоренная сотрудником подпись остаётся в карточке с пометкой, но в
 *    `notable` (строка вне карточки) не попадает;
 *  - профиль отключён по запросу сотрудника → ни подписей, ни осей;
 *  - пустое состояние — всегда текст, никогда пустая карточка.
 *
 * Чистые функции: без DI и `new Date()` — «сейчас» приходит аргументом.
 */
import {
    findStyleAxis,
    STYLE_CONFIDENCE_REASONS,
    type StyleAxisCode,
} from '@lib/sales-ai-analytics';
import {
    AI_STYLE_HOW_WE_COUNT,
    AI_STYLE_MAX_TAGS,
    AI_STYLE_STALE_AFTER_MONTHS,
    AI_STYLE_TEXTS,
    type AiStyleCardStatus,
} from '../constants/ai-style.const';
import type { AiStyleAxisDto, AiStyleCardDto } from '../dto/ai-style-card.dto';
import type { AiStyleTagDto } from '../dto/ai-style-profile.dto';

/** Нагрузка снапшота в форме, в которой её читает карточка. */
export interface StyleSnapshotPayload {
    calls?: number;
    peers?: number;
    vector?: Record<string, unknown>;
    tags?: unknown;
    axes?: unknown;
    confidence?: string;
    confidenceReason?: string | null;
    window?: string[];
    funnelShape?: string;
    /** Коды подписей, оспоренных субъектом (пишет feedback). */
    disputedTags?: string[];
}

export interface StyleCardInput {
    managerId: string;
    monthKey: string | null;
    payload: StyleSnapshotPayload | null;
    generatedAt: string | null;
    /** Сотрудник отказался от профилирования. */
    optOut: boolean;
    /** «Сейчас» для признака устаревшего профиля (YYYY-MM). */
    nowMonthKey: string;
}

const isNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const asString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

/** Пустая карточка с текстом-причиной (профиля нет, мало данных, отказ). */
function emptyCard(
    input: StyleCardInput,
    status: AiStyleCardStatus,
    note: string,
): AiStyleCardDto {
    return {
        status,
        managerId: input.managerId,
        monthKey: input.monthKey,
        window: input.payload?.window ?? [],
        profile: null,
        notable: [],
        axes: [],
        funnelShape: input.payload?.funnelShape ?? 'unknown',
        stale: false,
        note,
        howWeCount: [...AI_STYLE_HOW_WE_COUNT],
        generatedAt: input.generatedAt,
    };
}

/** Подписи снапшота с пометкой «оспорена», чужая форма записи — мимо. */
export function tagsOf(
    value: unknown,
    disputed: readonly string[],
): AiStyleTagDto[] {
    const list = Array.isArray(value) ? value : [];
    return list
        .flatMap((item): AiStyleTagDto[] => {
            const tag = (item ?? {}) as Record<string, unknown>;
            const code = asString(tag.code);
            const title = asString(tag.title);
            if (code === null || title === null) return [];
            return [
                {
                    code,
                    title,
                    basis: asString(tag.basis) ?? '',
                    n: isNumber(tag.n) ? tag.n : 0,
                    disputed: disputed.includes(code),
                },
            ];
        })
        .slice(0, AI_STYLE_MAX_TAGS);
}

/** Оси снапшота с названиями полюсов из справочника библиотеки. */
export function axesOfPayload(value: unknown): AiStyleAxisDto[] {
    const list = Array.isArray(value) ? value : [];
    return list.flatMap((item): AiStyleAxisDto[] => {
        const axis = (item ?? {}) as Record<string, unknown>;
        const code = asString(axis.code);
        const descriptor =
            code === null ? undefined : findStyleAxis(code as StyleAxisCode);
        if (descriptor === undefined) return [];
        const confidence = (axis.confidence ?? {}) as Record<string, unknown>;
        const ci80 = Array.isArray(axis.ci80) ? axis.ci80.filter(isNumber) : [];
        return [
            {
                code: descriptor.code,
                title: descriptor.title,
                minus: descriptor.minus,
                plus: descriptor.plus,
                value: isNumber(axis.dTilde) ? axis.dTilde : 0,
                ci80: ci80.length === 2 ? ci80 : [0, 0],
                n: isNumber(axis.n) ? axis.n : 0,
                confidence: asString(confidence.level) ?? 'none',
                reason: asString(confidence.reason),
            },
        ];
    });
}

/** Вектор осей: только числовые значения (пустой при доверии none). */
function vectorOf(value: unknown): Record<string, number> {
    if (value === null || typeof value !== 'object') return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, number] => isNumber(entry[1]),
        ),
    );
}

/** Профиль давно не пересчитывался: месяц снапшота отстал от текущего. */
export function isStale(
    monthKey: string | null,
    nowMonthKey: string,
    afterMonths = AI_STYLE_STALE_AFTER_MONTHS,
): boolean {
    if (monthKey === null) return false;
    const months = (key: string): number => {
        const [year, month] = key.split('-').map(Number);
        return Number.isFinite(year) && Number.isFinite(month)
            ? year * 12 + month
            : Number.NaN;
    };
    const distance = months(nowMonthKey) - months(monthKey);
    return Number.isFinite(distance) && distance > afterMonths;
}

/**
 * Карточка стиля. Отказ от профилирования и доверие `none` дают не
 * пустой ответ, а текст причины: человек должен понимать, почему тут
 * ничего нет.
 */
export function buildStyleCard(input: StyleCardInput): AiStyleCardDto {
    if (input.optOut) {
        return emptyCard(input, 'opt_out', AI_STYLE_TEXTS.optOut);
    }
    const payload = input.payload;
    if (payload === null) {
        return emptyCard(input, 'few_data', AI_STYLE_TEXTS.fewData);
    }
    const calls = isNumber(payload.calls) ? payload.calls : 0;
    const confidence = payload.confidence ?? 'none';
    // Порог разборов НЕ дублируется здесь: `style_min_calls` — параметр
    // реестра, и шаг уже применил портальное значение, поставив
    // `confidence: none` с причиной `few-calls`. Своя копия дефолта
    // прятала бы законный профиль на портале с пониженным порогом.
    if (confidence === 'none') {
        return emptyCard(input, 'few_data', AI_STYLE_TEXTS.fewData);
    }
    const disputed = Array.isArray(payload.disputedTags)
        ? payload.disputedTags.filter(
              (code): code is string => typeof code === 'string',
          )
        : [];
    const tags = tagsOf(payload.tags, disputed);
    const stale = isStale(input.monthKey, input.nowMonthKey);
    // «Отдел мал» — тоже решение шага: он ставит доверие low с причиной
    // few-peers по портальному `style_min_peers`. Карточка читает причину
    // снапшота, а не сравнивает peers со своей копией порога.
    const note =
        payload.confidenceReason === STYLE_CONFIDENCE_REASONS.fewPeers
            ? AI_STYLE_TEXTS.smallTeam
            : stale
              ? AI_STYLE_TEXTS.stale
              : null;
    return {
        status: 'ready',
        managerId: input.managerId,
        monthKey: input.monthKey,
        window: payload.window ?? [],
        profile: {
            tags,
            vector: vectorOf(payload.vector),
            confidence,
            calls,
        },
        // Вне карточки оспоренная подпись не используется (§1.3).
        notable: tags
            .filter(tag => tag.disputed !== true)
            .map(tag => tag.title),
        axes: axesOfPayload(payload.axes),
        funnelShape: payload.funnelShape ?? 'unknown',
        stale,
        note,
        howWeCount: [...AI_STYLE_HOW_WE_COUNT],
        generatedAt: input.generatedAt,
    };
}
