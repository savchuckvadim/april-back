import { formatTimecode } from '@lib/call-lib';
import {
    LONG_CALL_EMPTY_DIGEST_SHARE,
    LONG_CALL_EVENT_KINDS,
    LONG_CALL_PART_CHARS,
    LONG_CALL_SEC_TOLERANCE,
    PART_DIGEST_LIMITS,
} from '../long-call/long-call.const';
import type {
    PartDigest,
    PartDigestEvent,
    TranscriptPart,
} from '../long-call/long-call.types';
import {
    clipText,
    isFiniteNumber,
    isOneOf,
    isRecord,
} from '../long-call/long-call-parse.util';

/**
 * Контракт задания «конспект части» (этап 4а, длинный разговор по частям):
 * расшифровка длиннее порога режется на части, по каждой части модель пишет
 * короткий конспект с дословными цитатами и временем. Конспекты потом
 * сводятся в сводку разговора (call-long-summary.contract).
 *
 * Чистые константы и функции без DI.
 */

/** Имя роли (схемы) вызова — оно же в журнале шлюза. */
export const CALL_LONG_PART_SCHEMA_NAME = 'call_long_part';

const EVENT_SCHEMA = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: [...LONG_CALL_EVENT_KINDS] },
        startSec: { type: ['integer', 'null'], minimum: 0 },
        quote: { type: 'string' },
        note: { type: 'string' },
    },
    required: ['kind', 'startSec', 'quote', 'note'],
    additionalProperties: false,
} as const;

/** Строгая схема ответа: все поля обязательны, необязательное — через null. */
export const CALL_LONG_PART_SCHEMA = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        events: { type: 'array', items: EVENT_SCHEMA },
        managerQuestions: { type: 'integer', minimum: 0 },
        endsWith: { type: 'string' },
    },
    required: ['summary', 'events', 'managerQuestions', 'endsWith'],
    additionalProperties: false,
} as const;

/** Часть задания после вводного абзаца — не зависит от номера части. */
const CALL_LONG_PART_PROMPT_BODY = `Твоя задача — конспект этой части для аналитика, который не увидит полный
текст. Ничего не оценивай и не советуй: только что произошло.

Верни:
- summary — 3–6 предложений: о чём говорили в этой части, по порядку, кто
  что предложил и чем ответил собеседник.
- events — важные моменты части, по порядку, не больше 10. У каждого:
  kind — need (клиент назвал задачу, трудность, чем пользуется сейчас),
  presentation (менеджер показывал продукт или рассказывал о нём под задачи
  клиента), objection (клиент возразил, усомнился, отказался от чего-то),
  price (прозвучала цена, скидка, условия оплаты), competitor (упомянута
  другая система или другой поставщик), agreement (о чём-то договорились:
  показ, доступ, КП, счёт, созвон, дата), refusal (клиент отказал), issue
  (сбой: плохо слышно, связь прервалась, не тот номер, доступ не работает),
  other (иное важное);
  startSec — секунда начала по метке строки (метка [12:05] — это 725); меток
  нет — null;
  quote — дословная фраза из текста, не длиннее 200 знаков, без пересказа;
  note — одной фразой: что произошло и чем ответила другая сторона.
- managerQuestions — сколько вопросов задал менеджер в этой части, числом.
- endsWith — одной фразой, на чём кончается часть: разговор продолжается,
  стороны попрощались или запись обрывается на полуслове.

Правила: цитаты только дословные; не выдумывай событий, которых нет в
тексте; если в части нет содержания (ожидание, «алло», паузы) — верни пустой
events и скажи об этом в summary.`;

/** Что нужно заданию от части. */
type PartHeader = Pick<
    TranscriptPart,
    'number' | 'total' | 'fromSec' | 'toSec'
>;

/**
 * Задание (system) для одной части: номер, число частей и время подставлены;
 * у записи без меток слова о времени опускаются.
 */
export function buildCallLongPartPrompt(part: PartHeader): string {
    const time =
        part.fromSec !== null && part.toSec !== null
            ? `, время ${formatTimecode(part.fromSec)}–${formatTimecode(part.toSec)} от начала записи`
            : '';

    return `Ты помогаешь разобрать длинный телефонный разговор менеджера по продажам с
клиентом. Разговор разрезан на части по порядку; перед тобой ОДНА часть —
№ ${part.number} из ${part.total}${time}. Соседние части
перекрываются примерно на минуту, поэтому начало этой части могло уже
прозвучать в предыдущей.

${CALL_LONG_PART_PROMPT_BODY}`;
}

/** Вход модели (user): строка «ЧАСТЬ n ИЗ total:» и текст части. */
export function buildCallLongPartUserContent(
    part: Pick<TranscriptPart, 'number' | 'total' | 'text'>,
): string {
    return `ЧАСТЬ ${part.number} ИЗ ${part.total}:\n${part.text}`;
}

/** Допустимые секунды события. */
interface SecRange {
    min: number;
    max: number;
}

/** Время части с запасом; меток нет — null. */
function eventSecRange(
    part: Pick<TranscriptPart, 'fromSec' | 'toSec'>,
): SecRange | null {
    if (part.fromSec === null || part.toSec === null) return null;

    return {
        min: Math.max(0, part.fromSec - LONG_CALL_SEC_TOLERANCE),
        max: part.toSec + LONG_CALL_SEC_TOLERANCE,
    };
}

function parseStartSec(value: unknown, range: SecRange | null): number | null {
    if (range === null || !isFiniteNumber(value)) return null;

    return value >= range.min && value <= range.max ? value : null;
}

/** Событие из ответа модели; неизвестный вид или пустая цитата — null. */
function parseEvent(
    raw: unknown,
    range: SecRange | null,
): PartDigestEvent | null {
    if (!isRecord(raw) || !isOneOf(LONG_CALL_EVENT_KINDS, raw.kind)) {
        return null;
    }
    const quote = clipText(raw.quote, PART_DIGEST_LIMITS.quoteChars);
    if (quote === '') return null;

    return {
        kind: raw.kind,
        startSec: parseStartSec(raw.startSec, range),
        quote,
        note: clipText(raw.note, PART_DIGEST_LIMITS.noteChars),
    };
}

/**
 * Ответ модели → конспект части. Не объект или нет summary — null (запрос
 * считается неудавшимся). Остальное чистится: лишнее отбрасывается, длинное
 * обрезается, время вне части (с запасом) и не число — null.
 */
export function parseCallLongPartResponse(
    raw: unknown,
    part: Pick<TranscriptPart, 'fromSec' | 'toSec'>,
): PartDigest | null {
    if (!isRecord(raw)) return null;
    const summary = clipText(raw.summary, PART_DIGEST_LIMITS.summaryChars);
    if (summary === '') return null;
    const range = eventSecRange(part);
    const events = (Array.isArray(raw.events) ? raw.events : [])
        .map(event => parseEvent(event, range))
        .filter((event): event is PartDigestEvent => event !== null)
        .slice(0, PART_DIGEST_LIMITS.maxEvents);

    return {
        summary,
        events,
        managerQuestions:
            typeof raw.managerQuestions === 'number' &&
            Number.isInteger(raw.managerQuestions) &&
            raw.managerQuestions >= 0
                ? raw.managerQuestions
                : 0,
        endsWith: clipText(raw.endsWith, PART_DIGEST_LIMITS.endsWithChars),
    };
}

/**
 * Конспект подозрительно пуст: событий нет, а текст части длиннее половины
 * размера части. Сервис в этом случае повторяет запрос.
 */
export function isDigestSuspiciouslyEmpty(
    digest: PartDigest,
    part: Pick<TranscriptPart, 'text'>,
    partChars: number = LONG_CALL_PART_CHARS,
): boolean {
    return (
        digest.events.length === 0 &&
        part.text.length > partChars * LONG_CALL_EMPTY_DIGEST_SHARE
    );
}
