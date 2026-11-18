/**
 * Сборщик подсветок страницы звонка: ищет место в расшифровке и раздаёт
 * подсветкам идентификаторы по порядку внутри вида («objection-1»,
 * «section-2»). Места нет ни в тексте, ни по времени — подсветки нет.
 */
import {
    CALL_PAGE_HIGHLIGHT_KIND_TITLES,
    type CallPageHighlightKind,
    type CallPageTone,
} from './call-page.const';
import {
    matchAnchor,
    type TranscriptAnchorIndex,
} from '@lib/call-lib/call-report/transcript-anchor';
import type { CallPageAnchor } from './call-page.types';
import type { CallPageHighlightDto } from './dto/call-page-parts.dto';

export interface CallPageHighlightDraft {
    kind: CallPageHighlightKind;
    label: string;
    tone: CallPageTone;
    note: string | null;
    anchor: CallPageAnchor;
}

export class CallPageHighlightCollector {
    readonly highlights: CallPageHighlightDto[] = [];
    private readonly counters = new Map<CallPageHighlightKind, number>();

    constructor(private readonly index: TranscriptAnchorIndex) {}

    /** Идентификатор подсветки; места нет ни в тексте, ни по времени — null. */
    add(draft: CallPageHighlightDraft): string | null {
        const match = matchAnchor(this.index, draft.anchor);
        if (match.segmentIndexes.length === 0 && match.startSec === null) {
            return null;
        }
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
