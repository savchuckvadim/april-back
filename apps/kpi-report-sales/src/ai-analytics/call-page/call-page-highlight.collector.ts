/**
 * Сборщик подсветок страницы звонка: ищет место в расшифровке и раздаёт
 * подсветкам идентификаторы по порядку внутри вида («objection-1»,
 * «section-2»). Место проверяется: нет уверенности — нет подсветки и кнопки
 * «Показать в разговоре» (время вне записи, цитата не нашлась и её слов нет
 * рядом с временем из разбора, момент на нулевой секунде).
 */
import {
    CALL_PAGE_HIGHLIGHT_KIND_TITLES,
    CALL_PAGE_PLACE_NEAR_RULE,
    type CallPageHighlightKind,
    type CallPageTone,
} from './call-page.const';
import {
    indexTranscript,
    locateCheckedAnchor,
    type TranscriptAnchorIndex,
} from '@lib/call-lib/call-report/transcript-anchor';
import type { CallPageAnchor, CallPageSegmentView } from './call-page.types';
import type { CallPageHighlightDto } from './dto/call-page-parts.dto';

export interface CallPageHighlightDraft {
    kind: CallPageHighlightKind;
    label: string;
    tone: CallPageTone;
    note: string | null;
    anchor: CallPageAnchor;
}

/** Конец последней реплики с временем; времени нет — null. */
function lastEndOf(segments: readonly CallPageSegmentView[]): number | null {
    return segments.reduce<number | null>(
        (last, segment) =>
            segment.endSec !== null && (last === null || segment.endSec > last)
                ? segment.endSec
                : last,
        null,
    );
}

export class CallPageHighlightCollector {
    readonly highlights: CallPageHighlightDto[] = [];
    private readonly counters = new Map<CallPageHighlightKind, number>();
    private readonly index: TranscriptAnchorIndex;
    /** Длина записи: длительность звонка, без неё — конец последней реплики. */
    private readonly durationSec: number | null;

    constructor(
        segments: readonly CallPageSegmentView[],
        durationSec: number | null = null,
    ) {
        this.index = indexTranscript(segments);
        this.durationSec = durationSec ?? lastEndOf(segments);
    }

    /** Идентификатор подсветки; места нет — null. */
    add(draft: CallPageHighlightDraft): string | null {
        const match = locateCheckedAnchor(
            this.index,
            draft.anchor,
            this.durationSec,
            CALL_PAGE_PLACE_NEAR_RULE,
        );
        if (match === null) return null;
        const number = (this.counters.get(draft.kind) ?? 0) + 1;
        this.counters.set(draft.kind, number);
        const id = `${draft.kind}-${number}`;
        this.highlights.push({
            id,
            kind: draft.kind,
            kindTitle: CALL_PAGE_HIGHLIGHT_KIND_TITLES[draft.kind],
            label: draft.label,
            tone: draft.tone,
            quote: draft.anchor.quote,
            note: draft.note,
            segmentIndexes: match.segmentIndexes,
            startSec: match.startSec,
        });
        return id;
    }
}
