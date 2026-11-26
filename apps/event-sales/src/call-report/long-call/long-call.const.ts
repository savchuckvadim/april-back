/**
 * Константы режима «длинный разговор по частям» (этап 4а): длинную
 * расшифровку режем на части, по каждой модель пишет конспект, затем одним
 * запросом сводит конспекты в сводку разговора. Здесь — только числа, виды
 * событий, статусы линий и направления дословного чтения; таблица «что
 * получает каждый проход» — в long-call-consumers.const.ts.
 *
 * Чистые константы: без DI, Bitrix и Prisma.
 */

/** Порог длинного разговора: расшифровка от стольких знаков идёт по частям. */
export const LONG_CALL_THRESHOLD_CHARS = 25_000;

/** Размер одной части, знаков. */
export const LONG_CALL_PART_CHARS = 9_000;

/** Перекрытие соседних частей, знаков (около минуты разговора). */
export const LONG_CALL_OVERLAP_CHARS = 900;

/** Хвост короче этой доли размера части приклеивается к предыдущей части. */
export const LONG_CALL_TAIL_SHARE = 1 / 3;

/** Конспект части «подозрительно пуст»: событий нет, а текст длиннее доли части. */
export const LONG_CALL_EMPTY_DIGEST_SHARE = 1 / 2;

/** Запас по времени при проверке секунд из ответа модели, секунд. */
export const LONG_CALL_SEC_TOLERANCE = 90;

/** Предельные размеры конспекта части. */
export const PART_DIGEST_LIMITS = {
    /** Событий в конспекте части, не больше. */
    maxEvents: 10,
    /** Цитата события, знаков. */
    quoteChars: 200,
    /** Пояснение события, знаков. */
    noteChars: 160,
    /** Краткое содержание части, знаков. */
    summaryChars: 700,
    /** «На чём кончается часть», знаков. */
    endsWithChars: 160,
} as const;

/** Предельные размеры сводки разговора. */
export const CONVERSATION_SUMMARY_LIMITS = {
    /** Сквозных линий, не больше. */
    maxThreads: 12,
    /** Отрезков для дословного чтения на одно направление, не больше. */
    maxWindowsPerDirection: 6,
    /** Длина отрезка, секунд. */
    windowMaxSec: 120,
    /** Рассказ о ходе разговора, знаков. */
    storyChars: 1_500,
    /** Тема линии, знаков. */
    topicChars: 80,
    /** Пояснение линии, знаков. */
    threadNoteChars: 300,
    /** Пояснение отрезка, знаков. */
    windowWhyChars: 160,
    /** «Чем кончился разговор», знаков. */
    resultChars: 300,
} as const;

/**
 * Радиус окна вокруг события, секунд: сначала шире, при нехватке бюджета
 * сужаем по ступеням.
 */
export const EVENT_WINDOW_RADIUS_SEC_STEPS = [45, 30, 15] as const;

/** То же для записи без меток времени, знаков. */
export const EVENT_WINDOW_RADIUS_CHARS_STEPS = [600, 400, 200] as const;

/** Виды событий конспекта части (и сквозных линий сводки). */
export const LONG_CALL_EVENT_KINDS = [
    'need',
    'presentation',
    'objection',
    'price',
    'competitor',
    'agreement',
    'refusal',
    'issue',
    'other',
] as const;

export type LongCallEventKind = (typeof LONG_CALL_EVENT_KINDS)[number];

/** Русские подписи видов событий — для текста конспекта. */
export const LONG_CALL_EVENT_KIND_LABELS: Record<LongCallEventKind, string> = {
    need: 'потребность',
    presentation: 'показ',
    objection: 'возражение',
    price: 'цена',
    competitor: 'конкурент',
    agreement: 'договорённость',
    refusal: 'отказ',
    issue: 'сбой',
    other: 'важное',
};

/** Статусы сквозной линии сводки. */
export const LONG_CALL_THREAD_STATUSES = [
    'resolved',
    'open',
    'dropped',
] as const;

export type LongCallThreadStatus = (typeof LONG_CALL_THREAD_STATUSES)[number];

/** Русские подписи статусов линии. */
export const LONG_CALL_THREAD_STATUS_LABELS: Record<
    LongCallThreadStatus,
    string
> = {
    resolved: 'закрыто',
    open: 'открыто',
    dropped: 'без ответа',
};

/**
 * Направления дословного чтения: четыре фокус-прохода и методика. Первые
 * четыре совпадают с FOCUS_KEYS (проверяется тестом).
 */
export const LONG_CALL_DIRECTIONS = [
    'form',
    'content',
    'movement',
    'closing',
    'methodology',
] as const;

export type LongCallDirection = (typeof LONG_CALL_DIRECTIONS)[number];

/** Заголовок текста «конспект по частям». */
export const LONG_CALL_DIGEST_TITLE = 'КОНСПЕКТ ПО ЧАСТЯМ';

/** Как назвать конец записи, когда ни одной части с конспектом нет. */
export const LONG_CALL_DIGEST_UNKNOWN_ENDING = 'неизвестно';
