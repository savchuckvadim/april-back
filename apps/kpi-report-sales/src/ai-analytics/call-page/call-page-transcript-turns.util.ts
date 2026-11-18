/**
 * Пословная расшифровка (Яндекс на длинных звонках отдаёт сегмент на каждое
 * слово) → реплики для показа и поиска места на странице звонка. Подряд
 * идущие слова одного говорящего (или оба неизвестны) склеиваются, пока
 * пауза короткая, реплика не длиннее предела и предложение не закончилось.
 * Фразовые сегменты (VibeCode) не склеиваются. До склейки убираются точные
 * повторы (одинаковые каналы стерео). Чистые функции.
 */
import type { CallPageSegmentView } from './call-page.types';

/** Реплика с временем до нумерации. */
export type CallPageTimedTurn = Omit<CallPageSegmentView, 'index'> & {
    startSec: number;
    endSec: number;
};

/** Расшифровка пословная, если в середине выборки сегмент не длиннее стольких слов. */
const WORD_LEVEL_MEDIAN_MAX_WORDS = 2;
/** Пауза между словами, с которой начинается новая реплика, сек. */
const TURN_MAX_PAUSE_SEC = 1.2;
/** Реплика не длиннее стольких слов. */
const TURN_MAX_WORDS = 25;
/** Реплика не длиннее стольких секунд. */
const TURN_MAX_SEC = 15;
/** Конец предложения — граница реплики. */
const SENTENCE_END = /[.?!…]["»)]*$/;

/** Повтор ищем среди стольких последних оставленных сегментов. */
const ECHO_LOOKBACK = 4;
/** Начало и конец повтора совпадают с точностью до стольких секунд. */
const ECHO_TIME_TOLERANCE_SEC = 0.05;

const wordCountOf = (text: string): number =>
    text.split(/\s+/).filter(word => word !== '').length;

const echoKeyOf = (text: string): string => text.trim().toLowerCase();

const isEcho = (kept: CallPageTimedTurn, turn: CallPageTimedTurn): boolean =>
    echoKeyOf(kept.text) === echoKeyOf(turn.text) &&
    Math.abs(kept.startSec - turn.startSec) <= ECHO_TIME_TOLERANCE_SEC &&
    Math.abs(kept.endSec - turn.endSec) <= ECHO_TIME_TOLERANCE_SEC;

/**
 * Точные повторы (два одинаковых канала стерео: тот же текст в то же время)
 * убираются, остаётся первый. Каналы могут чередоваться (а, б, а', б'),
 * поэтому повтор ищется среди нескольких последних сегментов. У повторов
 * разные говорящие — кто говорил, неизвестно.
 */
export function dropChannelEchoes(
    turns: readonly CallPageTimedTurn[],
): CallPageTimedTurn[] {
    const kept: CallPageTimedTurn[] = [];
    for (const turn of turns) {
        const recent = kept.slice(-ECHO_LOOKBACK);
        const original = recent.find(item => isEcho(item, turn));
        if (original === undefined) {
            kept.push({ ...turn });
        } else if (original.speaker !== turn.speaker) {
            original.speaker = null;
        }
    }
    return kept;
}

/** Сегменты пословные: медиана слов в сегменте не больше двух. */
export function isWordLevelTranscript(
    turns: readonly CallPageTimedTurn[],
): boolean {
    if (turns.length === 0) return false;
    const counts = turns.map(turn => wordCountOf(turn.text));
    counts.sort((a, b) => a - b);
    return (
        counts[Math.floor((counts.length - 1) / 2)] <=
        WORD_LEVEL_MEDIAN_MAX_WORDS
    );
}

interface TurnDraft extends CallPageTimedTurn {
    words: number;
}

function canJoin(current: TurnDraft, next: CallPageTimedTurn): boolean {
    return (
        current.speaker === next.speaker &&
        !SENTENCE_END.test(current.text) &&
        next.startSec - current.endSec < TURN_MAX_PAUSE_SEC &&
        current.words + wordCountOf(next.text) <= TURN_MAX_WORDS &&
        Math.max(current.endSec, next.endSec) - current.startSec <= TURN_MAX_SEC
    );
}

/** Склейка пословных сегментов в реплики: время — от первого слова до последнего. */
export function joinWordTurns(
    turns: readonly CallPageTimedTurn[],
): CallPageTimedTurn[] {
    const joined: TurnDraft[] = [];
    for (const turn of turns) {
        const current = joined[joined.length - 1];
        if (current !== undefined && canJoin(current, turn)) {
            current.text = `${current.text} ${turn.text}`;
            current.endSec = Math.max(current.endSec, turn.endSec);
            current.words += wordCountOf(turn.text);
        } else {
            joined.push({ ...turn, words: wordCountOf(turn.text) });
        }
    }
    return joined.map(turn => ({
        startSec: turn.startSec,
        endSec: turn.endSec,
        speaker: turn.speaker,
        text: turn.text,
    }));
}
