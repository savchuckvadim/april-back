/**
 * Расшифровка для страницы звонка. Источники по убыванию качества:
 * 1) сегменты с таймкодами (по ним ставится запись);
 * 2) диалог по ролям из разбора — без времени, но с «Менеджер / Клиент»;
 * 3) сплошной текст, порезанный на абзацы.
 * Чистые функции.
 */
import type { TranscriptSegment } from '@lib/call-lib';
import {
    dropChannelEchoes,
    isWordLevelTranscript,
    joinWordTurns,
    type CallPageTimedTurn,
} from './call-page-transcript-turns.util';
import type {
    CallPageDialogTurnView,
    CallPageSegmentView,
} from './call-page.types';

/** Абзац сплошного текста длиннее этого режем по предложениям, знаков. */
const PARAGRAPH_MAX_CHARS = 320;

export interface CallPageTranscript {
    segments: CallPageSegmentView[];
    /** Есть ли у реплик время. */
    timed: boolean;
}

const speakerOf = (value: string): CallPageSegmentView['speaker'] =>
    value === 'manager' || value === 'client' ? value : null;

/**
 * Реплики с таймкодами. Точные повторы (одинаковые каналы стерео)
 * убираются; пословная расшифровка склеивается в реплики (номера — заново
 * по порядку: подсветки ссылаются на номера реплик страницы), фразовая
 * остаётся как есть.
 */
function fromSegments(
    segments: readonly TranscriptSegment[],
): CallPageSegmentView[] {
    const turns: CallPageTimedTurn[] = dropChannelEchoes(
        segments
            .filter(segment => segment.text.trim() !== '')
            .map(segment => ({
                startSec: segment.startSec,
                endSec: segment.endSec,
                speaker: speakerOf(segment.speaker),
                text: segment.text.trim(),
            })),
    );
    const shown = isWordLevelTranscript(turns) ? joinWordTurns(turns) : turns;
    return shown.map((turn, index) => ({ index, ...turn }));
}

function fromDialog(
    dialog: readonly CallPageDialogTurnView[],
): CallPageSegmentView[] {
    return dialog.map((turn, index) => ({
        index,
        startSec: null,
        endSec: null,
        speaker: speakerOf(turn.role),
        text: turn.text,
    }));
}

/** Длинный абзац → куски по предложениям, каждый не длиннее предела. */
function splitParagraph(paragraph: string): string[] {
    if (paragraph.length <= PARAGRAPH_MAX_CHARS) return [paragraph];
    const sentences = paragraph.split(/(?<=[.!?…])\s+/);
    const parts: string[] = [];
    let current = '';
    for (const sentence of sentences) {
        if (
            current !== '' &&
            current.length + sentence.length + 1 > PARAGRAPH_MAX_CHARS
        ) {
            parts.push(current);
            current = sentence;
        } else {
            current = current === '' ? sentence : `${current} ${sentence}`;
        }
    }
    if (current !== '') parts.push(current);
    return parts;
}

function fromText(text: string): CallPageSegmentView[] {
    return text
        .split(/\n+/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph !== '')
        .flatMap(splitParagraph)
        .map((paragraph, index) => ({
            index,
            startSec: null,
            endSec: null,
            speaker: null,
            text: paragraph,
        }));
}

export function buildCallPageTranscript(
    source: {
        segments: readonly TranscriptSegment[] | null;
        text: string | null;
    },
    dialog: readonly CallPageDialogTurnView[],
): CallPageTranscript {
    const timed = source.segments ? fromSegments(source.segments) : [];
    if (timed.length > 0) return { segments: timed, timed: true };
    if (dialog.length > 0)
        return { segments: fromDialog(dialog), timed: false };
    return { segments: fromText(source.text ?? ''), timed: false };
}
