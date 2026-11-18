/**
 * Разделы разбора на странице звонка: только относящиеся к звонку и хоть
 * чем-то заполненные. Место раздела в разговоре — цитата-доказательство с
 * секундой (задание focus-v3.4, секунда проверена приёмом разбора), а у
 * прежних разборов или когда она не нашлась — цитата «как было» тем же
 * поиском, что и остальные места разбора. Нашлось — у раздела есть
 * подсветка (вид `section`, бейджем не выводится), нет — подсветки нет.
 * Чистые функции.
 */
import { sectionTitleOf } from '@lib/sales-ai-analytics';
import {
    CALL_PAGE_SECTION_SCORE_FAIR,
    CALL_PAGE_SECTION_SCORE_GOOD,
    type CallPageTone,
} from './call-page.const';
import { CallPageHighlightCollector } from './call-page-highlight.collector';
import { indexTranscript } from '@lib/call-lib/call-report/transcript-anchor';
import type {
    CallPageAnchor,
    CallPageSectionView,
    CallPageSegmentView,
} from './call-page.types';
import type {
    CallPageHighlightDto,
    CallPageSectionDto,
} from './dto/call-page-parts.dto';

export interface CallPageSectionHighlights {
    highlights: CallPageHighlightDto[];
    /** Подсветка раздела по его номеру в разборе; null — не привязано. */
    sectionIds: (string | null)[];
}

/** Раздел относится к этому типу звонка и хоть чем-то заполнен. */
export const isCallPageSectionShown = (section: CallPageSectionView): boolean =>
    section.relevance > 0 &&
    (section.score !== null ||
        section.analysis !== null ||
        section.advice !== null);

/** Окраска по оценке раздела — то же правило, что у оценок на сайте. */
export function sectionTone(score: number | null): CallPageTone {
    if (score === null) return 'neutral';
    if (score >= CALL_PAGE_SECTION_SCORE_GOOD) return 'good';
    return score >= CALL_PAGE_SECTION_SCORE_FAIR ? 'warn' : 'bad';
}

export function buildCallPageSectionHighlights(
    sections: readonly CallPageSectionView[],
    segments: readonly CallPageSegmentView[],
): CallPageSectionHighlights {
    const collector = new CallPageHighlightCollector(indexTranscript(segments));
    const sectionIds = sections.map(section => {
        if (!isCallPageSectionShown(section)) return null;
        const mark = (anchor: CallPageAnchor): string | null =>
            collector.add({
                kind: 'section',
                label: sectionTitleOf(section.section),
                tone: sectionTone(section.score),
                note: null,
                anchor,
            });
        const byEvidence =
            section.quote !== null || section.startSec !== null
                ? mark({
                      quote: section.quote,
                      startSec: section.startSec,
                      endSec: null,
                  })
                : null;
        if (byEvidence !== null || section.asWas === null) return byEvidence;
        return mark({ quote: section.asWas, startSec: null, endSec: null });
    });
    return { highlights: collector.highlights, sectionIds };
}

export function presentCallPageSections(
    sections: readonly CallPageSectionView[],
    highlightIds: readonly (string | null)[],
): CallPageSectionDto[] {
    const shown: CallPageSectionDto[] = [];
    sections.forEach((section, position) => {
        if (!isCallPageSectionShown(section)) return;
        shown.push({
            title: sectionTitleOf(section.section),
            score: section.score,
            analysis: section.analysis,
            asWas: section.asWas,
            weaknesses: section.weaknesses,
            advice: section.advice,
            alternatives: section.alternatives,
            quote: section.quote,
            highlightId: highlightIds[position] ?? null,
        });
    });
    return shown;
}
