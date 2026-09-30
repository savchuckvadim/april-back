/**
 * Устойчивый ключ рекомендации (план §4.10, §10 L5; Фаза 4, поток П18
 * `p4-recommendation-effect-model`).
 *
 * У `LeverCandidate` нет id: рычаг переписывается каждую ночь, поэтому
 * факты «выдана» и «выполнена» связываются составным ключом
 * `lever:ruleCode:callType:section:category`. Пустые части остаются
 * пустой строкой между разделителями, чтобы ключ всегда разбирался
 * обратно на пять частей. Ключ безопасен для поля `object` обратной
 * связи: без пробелов и разделителей внутри частей, длина ≤ 120.
 *
 * При переполнении хвост (или всё, кроме рычага) заменяется маркером
 * `#` + FNV-1a в hex — ключ остаётся детерминированным и пятичастным,
 * но исходные части из него уже не восстанавливаются.
 *
 * Чистые функции: без DI, Bitrix, Prisma и времени.
 */
import { AI_LEVERS, type AiLever, type LeverCandidate } from './lever.types';
import { fnv1a } from './prng';

/** Разделитель частей ключа. */
export const LEVER_KEY_SEPARATOR = ':';

/** Максимальная длина ключа — помещается в `object` обратной связи (≤ 200). */
export const LEVER_KEY_MAX_LENGTH = 120;

/** Маркер хэшированной части ключа. */
export const LEVER_KEY_HASH_MARKER = '#';

/** Частей в ключе: рычаг, правило, тип звонка, раздел, категория. */
const LEVER_KEY_PARTS_COUNT = 5;

/** Символы, запрещённые внутри части: пробелы, разделитель и маркер. */
const UNSAFE_CHARS = /[\s:#]/g;

/** Замена запрещённого символа. */
const SAFE_REPLACEMENT = '_';

/** Разряды hex-хэша uint32. */
const HASH_HEX_LENGTH = 8;

/** Поля кандидата, из которых собирается ключ. */
export type LeverKeySource = Pick<
    LeverCandidate,
    'lever' | 'ruleCode' | 'callType' | 'section' | 'category'
>;

/** Части ключа после разбора; отсутствовавшие части — пустые строки. */
export interface LeverKeyParts {
    readonly lever: AiLever;
    readonly ruleCode: string;
    readonly callType: string;
    readonly section: string;
    readonly category: string;
}

const isLever = (value: string): value is AiLever =>
    AI_LEVERS.some(lever => lever === value);

/** Часть ключа без пробелов, разделителей и маркера хэша. */
export const safeLeverKeyPart = (value: string | undefined): string =>
    (value ?? '').replace(UNSAFE_CHARS, SAFE_REPLACEMENT);

/** `#` + FNV-1a текста в hex, дополненный нулями до 8 разрядов. */
const hashPart = (text: string): string =>
    `${LEVER_KEY_HASH_MARKER}${fnv1a(text)
        .toString(16)
        .padStart(HASH_HEX_LENGTH, '0')}`;

const joinParts = (parts: readonly string[]): string =>
    parts.join(LEVER_KEY_SEPARATOR);

/**
 * Детерминированный ключ рекомендации `lever:ruleCode:callType:section:category`.
 * Переполнение (> 120 символов) решается в два шага: сначала хэшируется
 * хвост `callType:section:category`, затем — всё, кроме рычага.
 */
export function leverKeyOf(candidate: LeverKeySource): string {
    const lever = candidate.lever;
    const ruleCode = safeLeverKeyPart(candidate.ruleCode);
    const tail = [
        safeLeverKeyPart(candidate.callType),
        safeLeverKeyPart(candidate.section),
        safeLeverKeyPart(candidate.category),
    ];
    const full = joinParts([lever, ruleCode, ...tail]);
    if (full.length <= LEVER_KEY_MAX_LENGTH) {
        return full;
    }
    const tailHashed = joinParts([
        lever,
        ruleCode,
        hashPart(joinParts(tail)),
        '',
        '',
    ]);
    if (tailHashed.length <= LEVER_KEY_MAX_LENGTH) {
        return tailHashed;
    }

    return joinParts([
        lever,
        hashPart(joinParts([ruleCode, ...tail])),
        '',
        '',
        '',
    ]);
}

/**
 * Разбор ключа на части. `null` — не ключ рекомендации: не пять частей,
 * неизвестный рычаг, пустое правило, пробел внутри или превышение длины.
 */
export function parseLeverKey(key: string): LeverKeyParts | null {
    if (key.length > LEVER_KEY_MAX_LENGTH || /\s/.test(key)) {
        return null;
    }
    const parts = key.split(LEVER_KEY_SEPARATOR);
    if (parts.length !== LEVER_KEY_PARTS_COUNT) {
        return null;
    }
    const [lever, ruleCode, callType, section, category] = parts;
    if (!isLever(lever) || ruleCode === '') {
        return null;
    }

    return { lever, ruleCode, callType, section, category };
}

/** Ключ с хэшированной частью — исходные части из него не восстановить. */
export const isHashedLeverKey = (key: string): boolean =>
    key
        .split(LEVER_KEY_SEPARATOR)
        .some(part => part.startsWith(LEVER_KEY_HASH_MARKER));
