/**
 * Стерео «двойное моно»: телефония части порталов (gsr, 18.11.2026) пишет
 * в ОБА канала MP3 весь разговор. Яндекс распознаёт каналы отдельно и
 * возвращает каждое слово дважды — в канале '1' и в канале '2' с тем же
 * временем, — и расшифровка задваивается. Здесь по словам ответа решаем,
 * одинаковы ли каналы, и какой из них оставить.
 *
 * Чистые функции: без DI и сети.
 */
import type { TimedWord } from './segments.mapper';

/** Меньше слов в канале — решение не принимаем (каналы считаем разными). */
export const STEREO_ECHO_MIN_WORDS = 20;

/** Доля слов меньшего канала с «двойником», с которой каналы одинаковы. */
export const STEREO_ECHO_MIN_SHARE = 0.8;

/** Насколько может разойтись начало слова и его двойника, секунды. */
export const STEREO_ECHO_MAX_SHIFT_SEC = 0.1;

/** Запас на погрешность дробей: 3.16 − 3.06 = 0.10000000000000009. */
const EPSILON = 1e-9;

/** Каналы одинаковы: какой оставить и сколько слов совпало (для лога). */
export interface StereoEchoVerdict {
    /** Канал, где слов больше; при равенстве — первый по номеру ('1'). */
    keepChannel: string;
    /** Доля слов меньшего канала, у которых есть двойник, 0–1. */
    matchedShare: number;
}

interface KeyedWord {
    key: string;
    startSec: number;
}

/** Текст слова для сравнения: без регистра, ё = е. */
const keyOf = (word: string): string =>
    word.trim().toLowerCase().replace(/ё/g, 'е');

const byStart = (a: KeyedWord, b: KeyedWord): number => a.startSec - b.startSec;

/**
 * Двойное ли моно: каналов ровно два, в каждом не меньше
 * `STEREO_ECHO_MIN_WORDS` слов и у доли не меньше `STEREO_ECHO_MIN_SHARE`
 * слов меньшего канала есть двойник в другом (тот же текст, начало
 * в пределах `STEREO_ECHO_MAX_SHIFT_SEC`). Иначе — null: ничего не меняем.
 */
export function detectStereoEcho(
    words: readonly TimedWord[],
): StereoEchoVerdict | null {
    const channels = wordsByChannel(words);
    if (channels.size !== 2) return null;
    const [first, second] = [...channels.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    );
    if (
        first[1].length < STEREO_ECHO_MIN_WORDS ||
        second[1].length < STEREO_ECHO_MIN_WORDS
    ) {
        return null;
    }
    const [kept, smaller] =
        second[1].length > first[1].length ? [second, first] : [first, second];
    const matchedShare = countTwins(smaller[1], kept[1]) / smaller[1].length;

    return matchedShare >= STEREO_ECHO_MIN_SHARE
        ? { keepChannel: kept[0], matchedShare }
        : null;
}

/** Слова по каналам; слова без канала (моно) в решении не участвуют. */
function wordsByChannel(words: readonly TimedWord[]): Map<string, KeyedWord[]> {
    const channels = new Map<string, KeyedWord[]>();
    for (const word of words) {
        if (!word.channel) continue;
        const list = channels.get(word.channel) ?? [];
        list.push({ key: keyOf(word.word), startSec: word.startSec });
        channels.set(word.channel, list);
    }
    for (const list of channels.values()) list.sort(byStart);

    return channels;
}

/**
 * Сколько слов `words` имеют двойника в `others`. Оба списка отсортированы
 * по началу: окно кандидатов в `others` сдвигается вместе со словом.
 */
function countTwins(
    words: readonly KeyedWord[],
    others: readonly KeyedWord[],
): number {
    const shift = STEREO_ECHO_MAX_SHIFT_SEC + EPSILON;
    let from = 0;
    let twins = 0;
    for (const word of words) {
        while (
            from < others.length &&
            others[from].startSec < word.startSec - shift
        ) {
            from++;
        }
        for (
            let index = from;
            index < others.length &&
            others[index].startSec <= word.startSec + shift;
            index++
        ) {
            if (others[index].key === word.key) {
                twins++;
                break;
            }
        }
    }

    return twins;
}
