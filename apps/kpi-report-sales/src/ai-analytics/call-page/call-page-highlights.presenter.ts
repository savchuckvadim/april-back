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
import { CALL_PAGE_MOMENT_TITLES, type CallPageTone } from './call-page.const';
import {
    CallPageHighlightCollector,
    type CallPageHighlightDraft,
} from './call-page-highlight.collector';
import {
    callPageTitleOf,
    objectionHandlingOf,
    riskSpeakerTitleOf,
    rubTitle,
    shortTitle,
} from './call-page-titles.util';
import type {
    CallPageAnalysisView,
    CallPageSegmentView,
} from './call-page.types';
import type { CallPageHighlightDto } from './dto/call-page-parts.dto';

/** Момент разговора по времени из разбора. */
type CallPageMomentKey = keyof typeof CALL_PAGE_MOMENT_TITLES;

/**
 * Подсветки строк «Итогов разговора»: потребности, показ и следующий шаг —
 * моменты разговора, цена — первая названная цена. null — не привязано.
 */
export interface CallPageFactHighlightIds {
    needs: string | null;
    presentation: string | null;
    nextStep: string | null;
    price: string | null;
}

export interface CallPageHighlights {
    highlights: CallPageHighlightDto[];
    /** Подсветка возражения по его номеру в разборе; null — не привязано. */
    objectionIds: (string | null)[];
    /** Подсветка пункта методики по его номеру; null — не привязано. */
    checkpointIds: (string | null)[];
    factIds: CallPageFactHighlightIds;
}

/** Ошибка менеджера в показе: без потребностей или без «свойство — выгода». */
function signalDraft(
    view: CallPageAnalysisView,
): CallPageHighlightDraft | null {
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

interface CallPageMoment {
    key: CallPageMomentKey;
    note: string | null;
    startSec: number;
}

/**
 * Моменты разговора по времени из разбора: с чего началось выяснение
 * потребностей, показ и где договорились о следующем шаге. Времени нет
 * (старый разбор, расшифровка без меток) — момента нет.
 */
function momentsOf(view: CallPageAnalysisView): CallPageMoment[] {
    const moments: CallPageMoment[] = [];
    if (view.needsStartSec !== null) {
        moments.push({
            key: 'needs',
            note: null,
            startSec: view.needsStartSec,
        });
    }
    if (view.presentationStartSec !== null) {
        moments.push({
            key: 'presentation',
            note: null,
            startSec: view.presentationStartSec,
        });
    }
    const step = view.nextStep;
    if (step !== null && step.set && step.startSec !== null) {
        moments.push({
            key: 'nextStep',
            note: step.description,
            startSec: step.startSec,
        });
    }
    return moments.sort((a, b) => a.startSec - b.startSec);
}

export function buildCallPageHighlights(
    view: CallPageAnalysisView,
    segments: readonly CallPageSegmentView[],
    durationSec: number | null = null,
): CallPageHighlights {
    const collector = new CallPageHighlightCollector(segments, durationSec);

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

    const priceIds = view.prices.map(price =>
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
        }),
    );

    const momentIds = new Map<CallPageMomentKey, string | null>();
    for (const moment of momentsOf(view)) {
        momentIds.set(
            moment.key,
            collector.add({
                kind: 'moment',
                label: CALL_PAGE_MOMENT_TITLES[moment.key],
                tone: 'neutral',
                note: moment.note,
                anchor: {
                    quote: null,
                    startSec: moment.startSec,
                    endSec: null,
                },
            }),
        );
    }

    return {
        highlights: collector.highlights,
        objectionIds,
        checkpointIds,
        factIds: {
            needs: momentIds.get('needs') ?? null,
            presentation: momentIds.get('presentation') ?? null,
            nextStep: momentIds.get('nextStep') ?? null,
            price: priceIds.find(id => id !== null) ?? null,
        },
    };
}
