/**
 * Подсветки страницы звонка: места разбора (ошибки менеджера, возражения,
 * сигналы риска, пункты методики, сбои, цены), привязанные к репликам
 * расшифровки. Что считать ошибкой менеджера и действующим риск-флагом —
 * общие правила `@lib/sales-ai-analytics`, здесь только раскладка. Чистые
 * функции.
 */
import {
    CALL_MISTAKE_SIGNAL_TITLES,
    isActiveRiskFlag,
    isCallMistakeSignalKind,
    objectionTitleOf,
    resolveManagerSignal,
    riskTitleOf,
    upperFirst,
} from '@lib/sales-ai-analytics';
import {
    CALL_PAGE_HIGHLIGHT_KIND_TITLES,
    CALL_PAGE_MOMENT_TITLES,
    type CallPageHighlightKind,
    type CallPageTone,
} from './call-page.const';
import {
    indexTranscript,
    matchAnchor,
    type CallPageTranscriptIndex,
} from './call-page-highlights.util';
import {
    callPageTitleOf,
    objectionHandlingOf,
    riskSpeakerTitleOf,
    rubTitle,
    shortTitle,
} from './call-page-titles.util';
import type {
    CallPageAnalysisView,
    CallPageAnchor,
    CallPageSegmentView,
} from './call-page.types';
import type { CallPageHighlightDto } from './dto/call-page-parts.dto';

export interface CallPageHighlights {
    highlights: CallPageHighlightDto[];
    /** Подсветка возражения по его номеру в разборе; null — не привязано. */
    objectionIds: (string | null)[];
    /** Подсветка пункта методики по его номеру; null — не привязано. */
    checkpointIds: (string | null)[];
}

interface HighlightDraft {
    kind: CallPageHighlightKind;
    label: string;
    tone: CallPageTone;
    note: string | null;
    anchor: CallPageAnchor;
}

/** Собирает подсветки по порядку и раздаёт им идентификаторы. */
class HighlightCollector {
    readonly highlights: CallPageHighlightDto[] = [];
    private readonly counters = new Map<CallPageHighlightKind, number>();

    constructor(private readonly index: CallPageTranscriptIndex) {}

    /** Идентификатор подсветки; места нет ни в тексте, ни по времени — null. */
    add(draft: HighlightDraft): string | null {
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

/** Ошибка менеджера в показе: без потребностей или без «свойство — выгода». */
function signalDraft(view: CallPageAnalysisView): HighlightDraft | null {
    const signal = resolveManagerSignal(
        {
            riskFlags: [],
            objections: [],
            sections: view.sections,
            presentationDone: view.presentationDone,
            needsFound: view.needsFound,
            spiralsFull: view.methodology?.spiralsFull ?? null,
        },
        [],
    );
    if (signal === null || !isCallMistakeSignalKind(signal.kind)) return null;
    return {
        kind: 'signal',
        label: CALL_MISTAKE_SIGNAL_TITLES[signal.kind],
        tone: 'bad',
        note: signal.detail ? upperFirst(signal.detail) : null,
        anchor: { quote: signal.quote, startSec: null, endSec: null },
    };
}

const objectionTone = (handled: boolean | null): CallPageTone => {
    if (handled === null) return 'neutral';
    return handled ? 'good' : 'bad';
};

function priceLabel(price: CallPageAnalysisView['prices'][number]): string {
    const period = price.periodMonths ? ` за ${price.periodMonths} мес.` : '';
    const promo = price.kind === 'promo' ? ', по акции' : '';
    return `${rubTitle(price.amount)}${period}${promo}`;
}

/**
 * Моменты разговора по времени из разбора: с чего началось выяснение
 * потребностей, показ и где договорились о следующем шаге. Времени нет
 * (старый разбор, расшифровка без меток) — момента нет.
 */
function momentsOf(
    view: CallPageAnalysisView,
): { label: string; note: string | null; startSec: number }[] {
    const moments: { label: string; note: string | null; startSec: number }[] =
        [];
    if (view.needsStartSec !== null) {
        moments.push({
            label: CALL_PAGE_MOMENT_TITLES.needs,
            note: null,
            startSec: view.needsStartSec,
        });
    }
    if (view.presentationStartSec !== null) {
        moments.push({
            label: CALL_PAGE_MOMENT_TITLES.presentation,
            note: null,
            startSec: view.presentationStartSec,
        });
    }
    const step = view.nextStep;
    if (step !== null && step.set && step.startSec !== null) {
        moments.push({
            label: CALL_PAGE_MOMENT_TITLES.nextStep,
            note: step.description,
            startSec: step.startSec,
        });
    }
    return moments.sort((a, b) => a.startSec - b.startSec);
}

export function buildCallPageHighlights(
    view: CallPageAnalysisView,
    segments: readonly CallPageSegmentView[],
): CallPageHighlights {
    const collector = new HighlightCollector(indexTranscript(segments));

    const signal = signalDraft(view);
    if (signal !== null) collector.add(signal);

    const objectionIds = view.objections.map(objection =>
        collector.add({
            kind: 'objection',
            label: `${objectionTitleOf(objection.category)}: ${shortTitle(objection.objection)}`,
            tone: objectionTone(objection.handled),
            note: objectionHandlingOf(objection.handling, objection.reaction),
            anchor: objection,
        }),
    );

    for (const evidence of view.riskEvidence) {
        if (
            !isActiveRiskFlag(evidence.flag) ||
            !view.riskFlags.includes(evidence.flag)
        ) {
            continue;
        }
        collector.add({
            kind: 'risk',
            label: upperFirst(riskTitleOf(evidence.flag)),
            tone: 'bad',
            note: riskSpeakerTitleOf(evidence.speaker),
            anchor: evidence,
        });
    }

    const checkpointIds = (view.methodology?.checkpoints ?? []).map(
        checkpoint =>
            checkpoint.status === 'not_applicable'
                ? null
                : collector.add({
                      kind: 'methodology',
                      label: shortTitle(checkpoint.title),
                      tone: checkpoint.status === 'done' ? 'good' : 'bad',
                      note: null,
                      anchor: checkpoint,
                  }),
    );

    for (const issue of view.issues) {
        const label = callPageTitleOf('issue', issue.code);
        if (label === null) continue;
        collector.add({
            kind: 'issue',
            label,
            tone: 'warn',
            note: issue.note,
            // Время есть у разборов focus-v3.2; у старых место ищется по цитате.
            anchor: {
                quote: issue.quote,
                startSec: issue.startSec,
                endSec: issue.endSec,
            },
        });
    }

    for (const price of view.prices) {
        collector.add({
            kind: 'price',
            label: priceLabel(price),
            tone: 'neutral',
            note: price.product,
            anchor: {
                quote: price.quote,
                startSec: price.startSec,
                endSec: null,
            },
        });
    }

    for (const moment of momentsOf(view)) {
        collector.add({
            kind: 'moment',
            label: moment.label,
            tone: 'neutral',
            note: moment.note,
            anchor: { quote: null, startSec: moment.startSec, endSec: null },
        });
    }

    return { highlights: collector.highlights, objectionIds, checkpointIds };
}
