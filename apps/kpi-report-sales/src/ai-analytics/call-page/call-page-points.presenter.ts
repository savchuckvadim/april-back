/**
 * Места пунктов разбора в разговоре (задание focus-v3.4): потребности,
 * пункты «хвоста» и блоки 5К. У каждого пункта — своя подсветка (без
 * бейджа, отдаётся в `sectionHighlights`) и пункт строки «Итогов» с кнопкой
 * «Показать в разговоре». Места нет — пункта с кнопкой нет. Прежние разборы
 * этих полей не несут — пунктов нет, строки итогов как раньше. Чистые
 * функции.
 */
import {
    FIVE_K_TEXT_BLOCKS,
    HVOST_TEXT_BLOCKS,
    type ChecklistTextBlock,
} from '@lib/call-lib';
import type { CallPageHighlightKind } from './call-page.const';
import { CallPageHighlightCollector } from './call-page-highlight.collector';
import { shortTitle } from './call-page-titles.util';
import type {
    CallPageAnalysisView,
    CallPageChecklistPlaceView,
    CallPageSegmentView,
} from './call-page.types';
import type { CallPageFactItemDto } from './dto/call-page-fact.dto';
import type { CallPageHighlightDto } from './dto/call-page-parts.dto';

/** Длина подписи потребности в строке итогов. */
const NEED_LABEL_MAX = 60;

/** Пункты строк «Итогов» с местом в разговоре. */
export interface CallPagePointItems {
    needs: CallPageFactItemDto[];
    hvost: CallPageFactItemDto[];
    fiveK: CallPageFactItemDto[];
}

export const NO_POINT_ITEMS: CallPagePointItems = {
    needs: [],
    hvost: [],
    fiveK: [],
};

export interface CallPagePointHighlights {
    highlights: CallPageHighlightDto[];
    items: CallPagePointItems;
}

interface PointDraft {
    kind: CallPageHighlightKind;
    label: string;
    quote: string | null;
    startSec: number | null;
}

export function buildCallPagePointHighlights(
    view: CallPageAnalysisView,
    segments: readonly CallPageSegmentView[],
    durationSec: number | null = null,
): CallPagePointHighlights {
    const collector = new CallPageHighlightCollector(segments, durationSec);
    const itemOf = (draft: PointDraft): CallPageFactItemDto | null => {
        const highlightId = collector.add({
            kind: draft.kind,
            label: draft.label,
            tone: 'good',
            note: null,
            anchor: {
                quote: draft.quote,
                startSec: draft.startSec,
                endSec: null,
            },
        });
        return highlightId === null
            ? null
            : { label: draft.label, tone: 'good', highlightId };
    };
    const checklist = (
        kind: CallPageHighlightKind,
        blocks: readonly ChecklistTextBlock[],
        places: readonly CallPageChecklistPlaceView[],
    ): (CallPageFactItemDto | null)[] =>
        blocks.map(block => {
            const place = places.find(item => item.key === block.key);
            return place
                ? itemOf({
                      kind,
                      label: block.label,
                      quote: place.quote,
                      startSec: place.startSec,
                  })
                : null;
        });

    const needs = view.needItems.map(item =>
        itemOf({
            kind: 'need',
            label: shortTitle(item.need, NEED_LABEL_MAX),
            quote: item.quote,
            startSec: item.startSec,
        }),
    );
    const hvost = checklist('hvost', HVOST_TEXT_BLOCKS, view.hvostEvidence);
    const fiveK = checklist('five_k', FIVE_K_TEXT_BLOCKS, view.fiveKEvidence);
    const found = (
        items: (CallPageFactItemDto | null)[],
    ): CallPageFactItemDto[] =>
        items.filter((item): item is CallPageFactItemDto => item !== null);
    return {
        highlights: collector.highlights,
        items: {
            needs: found(needs),
            hvost: found(hvost),
            fiveK: found(fiveK),
        },
    };
}
