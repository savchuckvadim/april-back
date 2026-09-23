/**
 * Константы ручки «Досье менеджера» (план Фазы 3, поток П4 `p3-dossier`):
 * роут, окно по умолчанию, TTL и построители ключей кэша, опции джобы и
 * коды причин, по которым секция досье приходит пустой.
 *
 * Свой файл констант — требование владения общими файлами: поток не
 * трогает `constants/ai-analytics.const.ts` и `cache/cache-key.util.ts`.
 * Секция ключа своя (`dossier`), поэтому существующий `cache/reset`
 * чистит досье паттерном `dossier:*` (scope досье владелец добавляет
 * вместе с остальным wiring — до этого работает scope `all`).
 *
 * Чистые константы и чистые функции: без DI, Bitrix и Prisma.
 */
import { AI_ANALYTICS_CACHE_PREFIX } from './ai-analytics.const';

/** Роут ручки внутри префикса `ai-analytics`. */
export const AI_DOSSIER_ROUTE = 'dossier' as const;

/** Секция ключей кэша досье (ей же чистится `cache/reset`). */
export const AI_DOSSIER_CACHE_SECTION = 'dossier' as const;

/** Окно досье в месяцах: по умолчанию 3, границы валидации DTO — 1..12. */
export const AI_DOSSIER_MONTHS = {
    default: 3,
    min: 1,
    max: 12,
} as const;

/**
 * TTL досье, секунды. Окно, упирающееся в текущий месяц, живое — месяц
 * ещё пересчитывается ночным конвейером, поэтому кэш гасит только
 * всплеск повторных открытий карточки; окно целиком из закрытых месяцев
 * уже не изменится и лежит 30 дней. `error` — конверт ошибки процессора,
 * чтобы промах не ставил джобу заново сразу после падения (как у резюме).
 */
export const AI_DOSSIER_TTL_SECONDS = {
    live: 10 * 60,
    closed: 30 * 24 * 60 * 60,
    error: 120,
} as const;

/**
 * Опции Bull-джобы досье: приоритет пользовательской джобы, без ретраев
 * (промах читается повторным POST), таймаут 120 с — досье собирается из
 * `ais`, Битрикс не опрашивается.
 */
export const AI_DOSSIER_JOB_OPTIONS = {
    priority: 1,
    attempts: 1,
    timeout: 120_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** Верхняя граница выборки снапшотов окна (стор требует limit). */
export const AI_DOSSIER_SNAPSHOT_LIMIT = 500;

/** Недель в месяце с запасом: сколько ключей недель перебирать на месяц. */
export const AI_DOSSIER_WEEKS_PER_MONTH = 6;

/**
 * Коды причин, по которым секция досье пришла пустой. Любая упавшая или
 * отсутствующая секция даёт `null` и причину — досье собирается целиком
 * (приёмка потока).
 */
export const AI_DOSSIER_REASONS = {
    /** Снапшотов этого вида за окно нет. */
    noSnapshots: 'no-snapshots',
    /** Секцию делает соседний поток, её модуль ещё не подключён сборкой. */
    sectionNotAvailable: 'section-not-available',
    /** Источник секции ответил ошибкой — остальное досье собрано. */
    sectionFailed: 'section-failed',
    /** Сотрудник отказался от профилирования (`ai_analytics_style_opt_out`). */
    styleOptOut: 'style-opt-out',
} as const;

export type AiDossierReason =
    (typeof AI_DOSSIER_REASONS)[keyof typeof AI_DOSSIER_REASONS];

/** Человеческие подписи причин — их читает руководитель в карточке. */
export const AI_DOSSIER_REASON_TEXTS: Record<AiDossierReason, string> = {
    [AI_DOSSIER_REASONS.noSnapshots]:
        'За окно досье нет рассчитанных снапшотов этого раздела: ночной ' +
        'конвейер их ещё не сделал',
    [AI_DOSSIER_REASONS.sectionNotAvailable]:
        'Раздел собирается отдельной ручкой, которая в этой сборке ещё не ' +
        'подключена: числа появятся после её включения',
    [AI_DOSSIER_REASONS.sectionFailed]:
        'Источник раздела ответил ошибкой; остальные разделы досье на месте',
    [AI_DOSSIER_REASONS.styleOptOut]:
        'Сотрудник отказался от профилирования стиля: карточка стиля закрыта',
};

/**
 * Коды секций досье — в порядке карточки. Строками наружу они не ходят:
 * это поля DTO, а причины адресуются кодом секции в `reasons[]`.
 */
export const AI_DOSSIER_SECTIONS = {
    passport: 'passport',
    series: 'series',
    trends: 'trends',
    planFact: 'planFact',
    yoy: 'yoy',
    style: 'style',
    objections: 'objections',
    feedbackSummary: 'feedbackSummary',
    ropMarks: 'ropMarks',
    readiness: 'readiness',
} as const;

export type AiDossierSection =
    (typeof AI_DOSSIER_SECTIONS)[keyof typeof AI_DOSSIER_SECTIONS];

/**
 * Ключ кэша досье: `{prefix}:{domain}:dossier:{managerId}:{from}_{to}`.
 * Роль в ключ не входит: досье считается по одному менеджеру, а право
 * его смотреть проверяет ручка до постановки джобы.
 */
export function buildDossierKey(
    domain: string,
    managerId: string,
    fromMonth: string,
    toMonth: string,
): string {
    return (
        `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_DOSSIER_CACHE_SECTION}:` +
        `${String(Number(managerId))}:${fromMonth}_${toMonth}`
    );
}

/** Месяц 'YYYY-MM' на `shift` месяцев от данного (shift < 0 — назад). */
export function shiftMonth(monthKey: string, shift: number): string {
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const index = year * 12 + (month - 1) + shift;

    return (
        `${String(Math.floor(index / 12)).padStart(4, '0')}-` +
        `${String((index % 12) + 1).padStart(2, '0')}`
    );
}

/**
 * Ключи месяцев окна досье по возрастанию: `months` месяцев, последний —
 * месяц даты `today` в TZ портала.
 */
export function dossierMonthKeys(
    today: string,
    months: number,
): readonly string[] {
    const last = today.slice(0, 7);
    const count = Math.max(AI_DOSSIER_MONTHS.min, Math.trunc(months));

    return Array.from({ length: count }, (_, index) =>
        shiftMonth(last, index - (count - 1)),
    );
}

/** Окно целиком из закрытых месяцев (последний месяц окна уже прошёл)? */
export function isClosedDossierWindow(
    monthKeys: readonly string[],
    today: string,
): boolean {
    const last = monthKeys[monthKeys.length - 1];

    return last !== undefined && last < today.slice(0, 7);
}
