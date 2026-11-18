/**
 * Страница разбора звонка на сайте «Отчёта»: маршруты, справочники значений
 * ответа и тексты для человека.
 */
import type { EvidenceNearRule } from '@lib/call-lib/call-report/transcript-anchor';

/** Карточка звонка по ссылке-пропуску. */
export const CALL_PAGE_ROUTE = 'call-page/:token' as const;
/** Ссылки на страницы разбора для списка звонков — под сессией портала. */
export const CALL_PAGE_LINKS_ROUTE = 'call-page/links' as const;
/** Сколько звонков можно запросить за один раз. */
export const CALL_PAGE_LINKS_MAX = 100;
/** Запись разговора потоком. */
export const CALL_PAGE_AUDIO_ROUTE = 'call-page/:token/audio' as const;

export const CALL_PAGE_TONES = ['good', 'bad', 'warn', 'neutral'] as const;
export type CallPageTone = (typeof CALL_PAGE_TONES)[number];

export const CALL_PAGE_HIGHLIGHT_KINDS = [
    'signal',
    'objection',
    'risk',
    'methodology',
    'issue',
    'price',
    // Ход разговора: начало выяснения потребностей, показа и договорённость
    // о следующем шаге (время из разбора focus-v3.2).
    'moment',
    // Цитата «как было» раздела разбора. Бейджем над расшифровкой не
    // выводится: отдаётся отдельным списком `sectionHighlights`.
    'section',
    // Места пунктов разбора (focus-v3.4): потребность, пункт «хвоста», блок
    // 5К — тоже без бейджа, в `sectionHighlights`.
    'need',
    'hvost',
    'five_k',
] as const;
export type CallPageHighlightKind = (typeof CALL_PAGE_HIGHLIGHT_KINDS)[number];

/** Названия групп подсветок — подписи бейджей. */
export const CALL_PAGE_HIGHLIGHT_KIND_TITLES: Readonly<
    Record<CallPageHighlightKind, string>
> = {
    signal: 'Ошибки менеджера',
    objection: 'Возражения',
    risk: 'Сигналы риска',
    methodology: 'Методика',
    issue: 'Сбои',
    price: 'Цены',
    moment: 'Ход разговора',
    section: 'Разделы разговора',
    need: 'Потребности',
    hvost: 'Хвост',
    five_k: '5К',
};

/** С какой оценки раздела (1–10) он «хороший» и «средний» — как на сайте. */
export const CALL_PAGE_SECTION_SCORE_GOOD = 7;
export const CALL_PAGE_SECTION_SCORE_FAIR = 5;

/**
 * Проверка места без найденной цитаты (решение 18.11.2026): время из разбора
 * принимается, только если в ±20 с от него звучит не меньше 60 % значимых
 * слов цитаты (длиннее 3 букв). Иначе кнопки «Показать в разговоре» нет.
 */
export const CALL_PAGE_PLACE_NEAR_RULE: EvidenceNearRule = {
    beforeSec: 20,
    afterSec: 20,
    minWordLetters: 4,
    minWordShare: 0.6,
};

/** Подписи моментов разговора. */
export const CALL_PAGE_MOMENT_TITLES = {
    needs: 'Выяснение потребностей',
    presentation: 'Начало презентации',
    nextStep: 'Договорённость о следующем шаге',
} as const;

export const CALL_PAGE_SPEAKERS = ['manager', 'client'] as const;
export type CallPageSpeaker = (typeof CALL_PAGE_SPEAKERS)[number];

export const CALL_PAGE_CHECKPOINT_STATUSES = [
    'done',
    'missed',
    'not_applicable',
] as const;
export type CallPageCheckpointStatus =
    (typeof CALL_PAGE_CHECKPOINT_STATUSES)[number];

export const CALL_PAGE_CHECKPOINT_STATUS_TITLES: Readonly<
    Record<CallPageCheckpointStatus, string>
> = {
    done: 'Выполнен',
    missed: 'Пропущен',
    not_applicable: 'Не относится к звонку',
};

/** Тексты ошибок для человека: без кодов и названий сервисов. */
export const CALL_PAGE_MESSAGES = {
    invalidLink: 'Ссылка недействительна или отозвана',
    noAnalysis: 'По этому звонку ещё нет разбора',
    noAudio: 'Запись разговора недоступна',
} as const;

/** Сколько секунд помним адрес записи и имя менеджера. */
export const CALL_PAGE_AUDIO_URL_TTL_SEC = 10 * 60;
export const CALL_PAGE_MANAGER_NAME_TTL_SEC = 60 * 60;
