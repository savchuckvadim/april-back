import { readCallPageAnalysis } from '../call-page-analysis.reader';
import {
    buildCallPageSectionHighlights,
    presentCallPageSections,
    sectionTone,
} from '../call-page-sections.presenter';
import type {
    CallPageSectionView,
    CallPageSegmentView,
} from '../call-page.types';

/** Расшифровка без времени: место ищется только по тексту цитаты. */
const SEGMENTS: CallPageSegmentView[] = [
    'Добрый день, это Ирина, компания Гарант.',
    'Скажите, откуда вы сейчас берёте судебную практику?',
    'Ищем в интернете, уходит много времени.',
    'Тогда покажу, как это делается в системе.',
].map((text, index) => ({
    index,
    startSec: null,
    endSec: null,
    speaker: null,
    text,
}));

const sectionsOf = (
    sections: Record<string, unknown>[],
): CallPageSectionView[] => {
    const view = readCallPageAnalysis({ sections });
    if (view === null) throw new Error('разбор не прочитан');
    return view.sections;
};

const SECTIONS = sectionsOf([
    {
        section: 'NEEDS',
        relevance: 100,
        score: 8,
        analysis: 'Спросил про источник практики.',
        asWas: '«Откуда вы сейчас берёте судебную практику?»',
    },
    {
        section: 'PRESENTATION',
        relevance: 80,
        score: 5,
        analysis: 'Показ без связок.',
        asWas: 'Расскажу вам про все возможности нашей системы',
    },
    {
        section: 'OBJECTIONS',
        relevance: 60,
        score: 3,
        analysis: 'Возражений не было.',
    },
    {
        section: 'GREETING',
        relevance: 0,
        score: 9,
        analysis: 'Не относится.',
        asWas: 'это Ирина, компания Гарант',
    },
]);

describe('разделы страницы звонка: цитата «как было» в расшифровке', () => {
    const { highlights, sectionIds } = buildCallPageSectionHighlights(
        SECTIONS,
        SEGMENTS,
    );

    it('цитата нашлась — подсветка вида «раздел» с окраской по оценке', () => {
        expect(highlights).toEqual([
            {
                id: 'section-1',
                kind: 'section',
                kindTitle: 'Разделы разговора',
                label: expect.any(String) as string,
                tone: 'good',
                quote: '«Откуда вы сейчас берёте судебную практику?»',
                note: null,
                segmentIndexes: [1],
                startSec: null,
            },
        ]);
    });

    it('цитата не нашлась, цитаты нет, раздел не относится к звонку — подсветки нет', () => {
        expect(sectionIds).toEqual(['section-1', null, null, null]);
    });

    it('разделы страницы: id подсветки только у найденной цитаты, неотносящийся раздел скрыт', () => {
        const sections = presentCallPageSections(SECTIONS, sectionIds);
        expect(sections.map(section => section.highlightId)).toEqual([
            'section-1',
            null,
            null,
        ]);
        expect(sections[0]?.title).toBe(highlights[0]?.label);
    });

    it('окраска раздела — по оценке: от 7 хорошо, от 5 средне, ниже плохо', () => {
        expect(sectionTone(8)).toBe('good');
        expect(sectionTone(5)).toBe('warn');
        expect(sectionTone(3)).toBe('bad');
        expect(sectionTone(null)).toBe('neutral');
    });
});
