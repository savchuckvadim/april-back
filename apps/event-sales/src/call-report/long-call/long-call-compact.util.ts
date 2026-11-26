import { TRANSCRIPT_SPEAKER_LABELS } from '@lib/call-lib';
import { LONG_CALL_COMPACT_LIMITS } from './long-call.const';
import { splitTimecode } from './long-call-timecode.util';

/**
 * Уплотнение расшифровки для длинного пути: подряд идущие короткие строки
 * одного говорящего склеиваются в строки-фразы. Распознавание (Яндекс)
 * режет речь на сегменты по два-три слова, а у каждой строки своя метка
 * `[мм:сс]` и подпись говорящего — без склейки текст для модели получается
 * в разы длиннее самой расшифровки.
 *
 * Слова и их порядок не меняются. Чистая функция: без DI, Bitrix и Prisma.
 */

const LINE_BREAK = /\r?\n/;
const LINE_SEPARATOR = '\n';
const WORD_SEPARATOR = ' ';

/** Подписи говорящих в строках («Менеджер», «Клиент»); у unknown подписи нет. */
const SPEAKER_NAMES = Object.values(TRANSCRIPT_SPEAKER_LABELS).filter(
    name => name.length > 0,
);

/** Строка с меткой времени: метка, говорящий (пусто — подписи нет) и текст. */
interface Utterance {
    /** Строка как была. */
    source: string;
    /** Метка как написана: `[12:05]`. */
    label: string;
    sec: number;
    speaker: string;
    text: string;
}

/** Группа подряд идущих строк, которая станет одной строкой. */
interface Phrase {
    first: Utterance;
    /** Сколько строк в группе. */
    count: number;
    /** Секунда последней приклеенной строки. */
    lastSec: number;
    /** Тексты строк через пробел. */
    text: string;
}

/** Строка с меткой времени, разобранная по частям; без метки — null. */
function parseUtterance(source: string): Utterance | null {
    const timecoded = splitTimecode(source);
    if (timecoded === null) return null;
    const rest = timecoded.rest.trim();
    const speaker =
        SPEAKER_NAMES.find(name => rest.startsWith(`${name}:`)) ?? '';

    return {
        source,
        label: timecoded.label,
        sec: timecoded.sec,
        speaker,
        text: (speaker ? rest.slice(speaker.length + 1) : rest).trim(),
    };
}

const startPhrase = (utterance: Utterance): Phrase => ({
    first: utterance,
    count: 1,
    lastSec: utterance.sec,
    text: utterance.text,
});

/** Текст группы после приклейки строки. */
const textWith = (phrase: Phrase, utterance: Utterance): string =>
    [phrase.text, utterance.text]
        .filter(part => part.length > 0)
        .join(WORD_SEPARATOR);

/** Можно ли приклеить строку к группе (правила — LONG_CALL_COMPACT_LIMITS). */
function canJoin(phrase: Phrase, utterance: Utterance): boolean {
    return (
        utterance.speaker === phrase.first.speaker &&
        utterance.sec >= phrase.lastSec &&
        utterance.sec - phrase.first.sec <=
            LONG_CALL_COMPACT_LIMITS.maxSpanSec &&
        textWith(phrase, utterance).length <=
            LONG_CALL_COMPACT_LIMITS.maxTextChars
    );
}

function addToPhrase(phrase: Phrase, utterance: Utterance): void {
    phrase.text = textWith(phrase, utterance);
    phrase.lastSec = utterance.sec;
    phrase.count += 1;
}

/** Группа одной строкой: метка первой строки, подпись, тексты. Одиночная строка — как была. */
function printPhrase(phrase: Phrase): string {
    if (phrase.count === 1) return phrase.first.source;
    const { label, speaker } = phrase.first;

    return [label, speaker ? `${speaker}:` : '', phrase.text]
        .filter(part => part.length > 0)
        .join(WORD_SEPARATOR);
}

/**
 * Расшифровка для модели с уплотнёнными короткими строками.
 *
 * Следующая строка приклеивается к текущей группе, если у неё тот же
 * говорящий (или подписи нет у обеих), её время не раньше предыдущей строки
 * и не позже чем через `maxSpanSec` от первой строки группы, а текст группы
 * остаётся не длиннее `maxTextChars`. Строка без метки времени не
 * склеивается и обрывает группу; расшифровка без единой метки (старая
 * запись) возвращается как есть. Пустые строки отбрасываются.
 */
export function compactTranscript(text: string): string {
    const entries = text
        .split(LINE_BREAK)
        .filter(line => line.trim().length > 0)
        .map(line => ({ line, utterance: parseUtterance(line) }));
    if (entries.every(entry => entry.utterance === null)) return text;

    const output: string[] = [];
    let phrase: Phrase | null = null;
    for (const { line, utterance } of entries) {
        if (
            utterance !== null &&
            phrase !== null &&
            canJoin(phrase, utterance)
        ) {
            addToPhrase(phrase, utterance);
            continue;
        }
        if (phrase !== null) output.push(printPhrase(phrase));
        phrase = utterance === null ? null : startPhrase(utterance);
        if (utterance === null) output.push(line);
    }
    if (phrase !== null) output.push(printPhrase(phrase));

    return output.join(LINE_SEPARATOR);
}
