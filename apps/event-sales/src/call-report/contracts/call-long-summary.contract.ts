import {
    CONVERSATION_SUMMARY_LIMITS,
    LONG_CALL_DIRECTIONS,
    LONG_CALL_EVENT_KINDS,
    LONG_CALL_SEC_TOLERANCE,
    LONG_CALL_THREAD_STATUSES,
    type LongCallDirection,
} from '../long-call/long-call.const';
import type {
    ConversationSummary,
    SummaryThread,
    SummaryWindow,
    SummaryWindows,
} from '../long-call/long-call.types';
import {
    clipText,
    isFiniteNumber,
    isOneOf,
    isRecord,
} from '../long-call/long-call-parse.util';

/**
 * Контракт задания «сводка разговора» (этап 4а, длинный разговор по
 * частям): одним запросом модель сводит конспекты частей в сводку всего
 * разговора — сквозные линии, чем кончился, и места, которые аналитику надо
 * прочитать дословно (по направлениям разбора). Вход — текст «КОНСПЕКТ ПО
 * ЧАСТЯМ» (long-call-digest-text.util).
 *
 * Чистые константы и функции без DI.
 */

/** Имя роли (схемы) вызова — оно же в журнале шлюза. */
export const CALL_LONG_SUMMARY_SCHEMA_NAME = 'call_long_summary';

const THREAD_SCHEMA = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: [...LONG_CALL_EVENT_KINDS] },
        topic: { type: 'string' },
        status: { type: 'string', enum: [...LONG_CALL_THREAD_STATUSES] },
        moments: { type: 'array', items: { type: 'integer', minimum: 0 } },
        note: { type: 'string' },
    },
    required: ['kind', 'topic', 'status', 'moments', 'note'],
    additionalProperties: false,
} as const;

const WINDOW_SCHEMA = {
    type: 'object',
    properties: {
        fromSec: { type: 'integer', minimum: 0 },
        toSec: { type: 'integer', minimum: 0 },
        why: { type: 'string' },
    },
    required: ['fromSec', 'toSec', 'why'],
    additionalProperties: false,
} as const;

const WINDOW_LIST_SCHEMA = { type: 'array', items: WINDOW_SCHEMA } as const;

/** Отрезки по направлениям: объект с обязательным массивом на каждое. */
const WINDOWS_SCHEMA = {
    type: 'object',
    properties: Object.fromEntries(
        LONG_CALL_DIRECTIONS.map(direction => [direction, WINDOW_LIST_SCHEMA]),
    ) as Record<LongCallDirection, typeof WINDOW_LIST_SCHEMA>,
    required: [...LONG_CALL_DIRECTIONS],
    additionalProperties: false,
} as const;

/** Строгая схема ответа: все поля обязательны, необязательное — через null. */
export const CALL_LONG_SUMMARY_SCHEMA = {
    type: 'object',
    properties: {
        story: { type: 'string' },
        threads: { type: 'array', items: THREAD_SCHEMA },
        result: { type: 'string' },
        endedAbruptly: { type: 'boolean' },
        windows: WINDOWS_SCHEMA,
    },
    required: ['story', 'threads', 'result', 'endedAbruptly', 'windows'],
    additionalProperties: false,
} as const;

/** Задание (system); вход (user) — текст «КОНСПЕКТ ПО ЧАСТЯМ». */
export const CALL_LONG_SUMMARY_PROMPT = `Ты сводишь воедино длинный телефонный разговор менеджера по продажам с
клиентом. Полного текста у тебя нет: разговор разрезан на части, по каждой
есть конспект с дословными цитатами и временем от начала записи. Соседние
части перекрываются, поэтому одно и то же событие может встретиться дважды.

Твоя задача — связать части в один разговор. Ничего не оценивай и не
советуй. Опирайся только на конспекты: чего в них нет — того не знаешь.

Верни:
- story — 5–10 предложений: ход разговора целиком, по порядку: с чего начали,
  что выяснили о клиенте, что показали или предложили, какие были возражения
  и чем они кончились, о чём договорились.
- threads — сквозные линии разговора, не больше 12. Линия — тема, к которой
  возвращались в разных местах: потребность и ответ на неё, возражение и его
  судьба, цена и торг, договорённость. У каждой:
  kind — need, presentation, objection, price, competitor, agreement,
  refusal, issue или other;
  topic — тема в 3–8 словах;
  status — resolved (вопрос закрыт: возражение снято, договорились), open
  (остался открытым), dropped (тему оставили без ответа);
  moments — секунды, где линия звучала, по возрастанию (из времени событий
  конспекта); времени нет — пустой массив;
  note — одной-двумя фразами: как развивалась и чем кончилась.
- result — одной-двумя фразами: чем кончился разговор.
- endedAbruptly — true, если конспект последней части говорит, что запись
  обрывается на полуслове или без прощания; иначе false.
- windows — какие места разговора аналитику нужно прочитать дословно, по
  каждому направлению отдельно, не больше 6 отрезков на направление, отрезок
  не длиннее 120 секунд:
  form — как менеджер начал разговор и как держался: вход, тон, реакция на
  резкость;
  content — где выясняли потребности и где показывали продукт;
  movement — возражения, цена, конкуренты и ответы на них;
  closing — где договаривались о следующем шаге или получили отказ;
  methodology — ключевые места для проверки по чек-листу: выяснение
  потребностей, показ под задачу, договорённости.
  У отрезка: fromSec и toSec (секунды от начала записи) и why — зачем его
  читать, одной фразой. Времени в конспектах нет — пустые массивы.

Правила: не выдумывай того, чего нет в конспектах; одно событие из
перекрытия частей считай один раз; если о судьбе возражения конспект
молчит — status open.`;

/** Секунды ответа модели: конечные, неотрицательные, по возрастанию, без повторов. */
function parseMoments(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    const moments = value.filter(
        (moment): moment is number => isFiniteNumber(moment) && moment >= 0,
    );

    return [...new Set(moments)].sort((left, right) => left - right);
}

/** Линия из ответа модели; неизвестные вид или статус — null. */
function parseThread(raw: unknown): SummaryThread | null {
    if (
        !isRecord(raw) ||
        !isOneOf(LONG_CALL_EVENT_KINDS, raw.kind) ||
        !isOneOf(LONG_CALL_THREAD_STATUSES, raw.status)
    ) {
        return null;
    }

    return {
        kind: raw.kind,
        topic: clipText(raw.topic, CONVERSATION_SUMMARY_LIMITS.topicChars),
        status: raw.status,
        moments: parseMoments(raw.moments),
        note: clipText(raw.note, CONVERSATION_SUMMARY_LIMITS.threadNoteChars),
    };
}

/**
 * Отрезок из ответа модели: оба числа конечные, `0 ≤ fromSec < toSec`,
 * внутри записи с запасом (если длительность известна); длиннее предела —
 * `toSec` подрезается. Негодный отрезок — null.
 */
function parseWindow(
    raw: unknown,
    durationSec: number | null,
): SummaryWindow | null {
    if (
        !isRecord(raw) ||
        !isFiniteNumber(raw.fromSec) ||
        !isFiniteNumber(raw.toSec) ||
        raw.fromSec < 0 ||
        raw.fromSec >= raw.toSec
    ) {
        return null;
    }
    if (
        durationSec !== null &&
        raw.toSec > durationSec + LONG_CALL_SEC_TOLERANCE
    ) {
        return null;
    }

    return {
        fromSec: raw.fromSec,
        toSec: Math.min(
            raw.toSec,
            raw.fromSec + CONVERSATION_SUMMARY_LIMITS.windowMaxSec,
        ),
        why: clipText(raw.why, CONVERSATION_SUMMARY_LIMITS.windowWhyChars),
    };
}

function parseWindowList(
    value: unknown,
    durationSec: number | null,
): SummaryWindow[] {
    if (!Array.isArray(value)) return [];

    return value
        .map(window => parseWindow(window, durationSec))
        .filter((window): window is SummaryWindow => window !== null)
        .slice(0, CONVERSATION_SUMMARY_LIMITS.maxWindowsPerDirection);
}

/** Отрезки всех пяти направлений; нет направления в ответе — пустой список. */
function parseWindows(
    value: unknown,
    durationSec: number | null,
): SummaryWindows {
    const source = isRecord(value) ? value : {};

    return Object.fromEntries(
        LONG_CALL_DIRECTIONS.map(direction => [
            direction,
            parseWindowList(source[direction], durationSec),
        ]),
    ) as SummaryWindows;
}

/**
 * Ответ модели → сводка разговора. Не объект или нет story — null (запрос
 * считается неудавшимся). Остальное чистится: лишнее отбрасывается, длинное
 * обрезается или подрезается. durationSec — длительность записи в секундах
 * (null — неизвестна, отрезки по записи не проверяются).
 */
export function parseCallLongSummaryResponse(
    raw: unknown,
    durationSec: number | null,
): ConversationSummary | null {
    if (!isRecord(raw)) return null;
    const story = clipText(raw.story, CONVERSATION_SUMMARY_LIMITS.storyChars);
    if (story === '') return null;
    const duration = isFiniteNumber(durationSec) ? durationSec : null;
    const threads = (Array.isArray(raw.threads) ? raw.threads : [])
        .map(parseThread)
        .filter((thread): thread is SummaryThread => thread !== null)
        .slice(0, CONVERSATION_SUMMARY_LIMITS.maxThreads);

    return {
        story,
        threads,
        result: clipText(raw.result, CONVERSATION_SUMMARY_LIMITS.resultChars),
        endedAbruptly: raw.endedAbruptly === true,
        windows: parseWindows(raw.windows, duration),
    };
}
