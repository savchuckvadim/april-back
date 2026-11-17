/**
 * Сборка страницы звонка из строки расшифровки и разбора: подписи
 * по-русски, только относящиеся к звонку разделы, подсветки привязаны к
 * репликам. Чистые функции — всё, что нужно прочитать (имя менеджера,
 * ссылки), приходит готовым.
 */
import type { TranscriptSegment } from '@lib/call-lib';
import { callTypeTitleOf, objectionTitleOf } from '@lib/sales-ai-analytics';
import {
    CALL_PAGE_CHECKPOINT_STATUS_TITLES,
    CALL_PAGE_CHECKPOINT_STATUSES,
    type CallPageCheckpointStatus,
} from './call-page.const';
import { buildCallPageFacts } from './call-page-facts.presenter';
import { buildCallPageHighlights } from './call-page-highlights.presenter';
import {
    buildCallPageSectionHighlights,
    presentCallPageSections,
} from './call-page-sections.presenter';
import {
    callPageTitleOf,
    objectionHandlingOf,
    objectionOutcomeTitleOf,
} from './call-page-titles.util';
import { buildCallPageTranscript } from './call-page-transcript.util';
import type {
    CallPageAnalysisView,
    CallPageMethodologyView,
} from './call-page.types';
import type {
    CallPageCheckpointDto,
    CallPageMethodologyDto,
    CallPageObjectionDto,
} from './dto/call-page-parts.dto';
import type { CallPageDto, CallPageScoreDto } from './dto/call-page.dto';

/** Всё, из чего собирается страница. */
export interface CallPageSource {
    call: {
        startedAt: Date | null;
        /** Длительность из строки расшифровки (секунды строкой) или null. */
        durationSec: string | null;
        segments: readonly TranscriptSegment[] | null;
        text: string | null;
        /** Есть ли у звонка дело с записью. */
        hasAudio: boolean;
    };
    view: CallPageAnalysisView;
    managerName: string | null;
    smartUrl: string | null;
    crmUrl: string | null;
}

const INCOMPLETE_NOTE =
    'Разбор неполный: часть ещё дозаполняется, оценка и разделы могут измениться.';

/** Приоритет «разбор не требуется» на странице не показываем. */
const COACHING_SILENT = 'none';

function durationOf(source: CallPageSource): number | null {
    const stored = Number(source.call.durationSec);
    if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
    const last = source.call.segments?.[source.call.segments.length - 1];
    return last ? Math.round(last.endSec) : null;
}

/** Подпись типа звонка; кода нет в справочнике — null (код не показываем). */
function callTypeTitle(callType: string | null): string | null {
    if (callType === null) return null;
    const title = callTypeTitleOf(callType);
    return title === callType ? null : title;
}

function scoreOf(view: CallPageAnalysisView): CallPageScoreDto {
    return {
        score: view.score,
        weightedScore: view.weightedScore,
        scriptCompliance: view.scriptCompliance,
        explanation: view.scoreExplanation,
        coachingTitle:
            view.coachingPriority === COACHING_SILENT
                ? null
                : callPageTitleOf('coaching', view.coachingPriority),
        incompleteNote:
            view.incompleteParts.length > 0 ? INCOMPLETE_NOTE : null,
    };
}

function objectionsOf(
    view: CallPageAnalysisView,
    highlightIds: readonly (string | null)[],
): CallPageObjectionDto[] {
    return view.objections.map((objection, position) => ({
        text: objection.objection,
        categoryTitle: objectionTitleOf(objection.category),
        handled: objection.handled,
        handling: objectionHandlingOf(objection.handling, objection.reaction),
        quote: objection.quote,
        outcomeTitle: objectionOutcomeTitleOf(objection.outcome),
        highlightId: highlightIds[position] ?? null,
    }));
}

const isCheckpointStatus = (value: string): value is CallPageCheckpointStatus =>
    (CALL_PAGE_CHECKPOINT_STATUSES as readonly string[]).includes(value);

function spiralsNote(methodology: CallPageMethodologyView): string | null {
    if (methodology.spiralsFull === null) return null;
    const need =
        methodology.spiralsMinFull === null
            ? ''
            : ` из ${methodology.spiralsMinFull} нужных`;
    return `Полных связок «потребность — свойство — выгода» в показе: ${methodology.spiralsFull}${need}`;
}

function methodologyOf(
    methodology: CallPageMethodologyView | null,
    highlightIds: readonly (string | null)[],
): CallPageMethodologyDto | null {
    if (methodology === null) return null;
    const checkpoints: CallPageCheckpointDto[] = [];
    methodology.checkpoints.forEach((checkpoint, position) => {
        if (!isCheckpointStatus(checkpoint.status)) return;
        checkpoints.push({
            title: checkpoint.title,
            status: checkpoint.status,
            statusTitle: CALL_PAGE_CHECKPOINT_STATUS_TITLES[checkpoint.status],
            mandatory: checkpoint.mandatory,
            quote: checkpoint.quote,
            highlightId: highlightIds[position] ?? null,
        });
    });
    const applicable = checkpoints.filter(
        checkpoint => checkpoint.status !== 'not_applicable',
    );
    return {
        title: methodology.title,
        checkpointsDone:
            methodology.checkpointsDone ??
            applicable.filter(checkpoint => checkpoint.status === 'done')
                .length,
        checkpointsTotal: methodology.checkpointsTotal ?? applicable.length,
        spiralsNote: spiralsNote(methodology),
        checkpoints,
    };
}

export function presentCallPage(source: CallPageSource): CallPageDto {
    const { view } = source;
    const transcript = buildCallPageTranscript(source.call, view.dialog);
    const { highlights, objectionIds, checkpointIds, factIds } =
        buildCallPageHighlights(view, transcript.segments);
    const sectionMarks = buildCallPageSectionHighlights(
        view.sections,
        transcript.segments,
    );
    return {
        call: {
            managerName: source.managerName,
            startedAt: source.call.startedAt?.toISOString() ?? null,
            durationSec: durationOf(source),
            callTypeTitle: callTypeTitle(view.callType),
            callTypeReason: view.callTypeReason,
            hasAudio: source.call.hasAudio,
            smartUrl: source.smartUrl,
            crmUrl: source.crmUrl,
        },
        score: scoreOf(view),
        summary: view.summary,
        recommendations: view.recommendations,
        employeeRecommendations: view.employeeRecommendations,
        facts: buildCallPageFacts(view, factIds),
        sections: presentCallPageSections(
            view.sections,
            sectionMarks.sectionIds,
        ),
        objections: objectionsOf(view, objectionIds),
        methodology: methodologyOf(view.methodology, checkpointIds),
        transcript: transcript.segments,
        transcriptTimed: transcript.timed,
        highlights,
        sectionHighlights: sectionMarks.highlights,
    };
}
