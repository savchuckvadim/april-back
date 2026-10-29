import type { AgentSectionAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    dedupeSectionsWithLog,
    mergeDuplicateSections,
} from '../services/agent-analysis-sections.util';

const section = (
    code: string,
    relevance: number,
    over: Partial<AgentSectionAnalysisDto> = {},
): AgentSectionAnalysisDto =>
    ({ section: code, relevance, ...over }) as AgentSectionAnalysisDto;

describe('mergeDuplicateSections', () => {
    it('без дублей — те же записи в том же порядке, дублей нет', () => {
        const input = [
            section('GREETING', 100, { score: 8 }),
            section('NEEDS', 80, { score: 6 }),
            section('PRICE', 0),
        ];
        const result = mergeDuplicateSections(input);
        expect(result.sections).toEqual(input);
        expect(result.duplicates).toEqual({});
        expect(mergeDuplicateSections(undefined)).toEqual({
            sections: [],
            duplicates: {},
        });
    });

    it('три «Приветствия» и две «Цены» (кейс 29.10.2026) — по одной записи, главная с максимальной актуальностью', () => {
        const result = mergeDuplicateSections([
            section('GREETING', 100, { score: 1, asWas: 'Алло, да' }),
            section('GREETING', 40, {
                score: 4,
                asWas: 'повторно поздоровался',
            }),
            section('GREETING', 100, { score: 1, asWas: 'Алло, да' }),
            section('PRESENTATION', 100, { score: 1 }),
            section('NEEDS', 70, { score: 3 }),
            section('PRICE', 100, { score: 1, analysis: 'первый заход' }),
            section('CLOSING', 100, { score: 2 }),
            section('OBJECTIONS', 80, { score: 3 }),
            section('PRICE', 100, { score: 1, analysis: 'второй заход' }),
        ]);

        expect(result.sections.map(item => item.section)).toEqual([
            'GREETING',
            'PRESENTATION',
            'NEEDS',
            'PRICE',
            'CLOSING',
            'OBJECTIONS',
        ]);
        expect(result.sections[0]).toMatchObject({
            relevance: 100,
            score: 1,
            asWas: 'Алло, да',
        });
        // При равной актуальности остаётся первая запись.
        expect(result.sections[3]).toMatchObject({
            score: 1,
            analysis: 'первый заход',
        });
        expect(result.duplicates).toEqual({ GREETING: 2, PRICE: 1 });
    });

    it('главная запись — самая актуальная, а не первая; её пустые поля добираются из остальных', () => {
        const [merged] = mergeDuplicateSections([
            section('GREETING', 40, {
                score: 4,
                asWas: 'второй раз поздоровался',
                weaknesses: 'суетливо',
                alternatives: ['вариант А'],
            }),
            section('GREETING', 100, {
                asWas: 'Добрый день, компания Гарант',
                advice: 'представляться полностью',
            }),
        ]).sections;

        expect(merged).toEqual({
            section: 'GREETING',
            relevance: 100,
            // Оценки у главной не было — взята у второй записи.
            score: 4,
            asWas: 'Добрый день, компания Гарант',
            weaknesses: 'суетливо',
            advice: 'представляться полностью',
            alternatives: ['вариант А'],
        });
    });

    it('тексты не склеиваются: у главной записи своё «как было», чужое не дописывается', () => {
        const [merged] = mergeDuplicateSections([
            section('PRICE', 100, { score: 2, asWas: 'назвал цену сразу' }),
            section('PRICE', 100, { score: 5, asWas: 'вернулся к цене' }),
        ]).sections;
        expect(merged.asWas).toBe('назвал цену сразу');
        expect(merged.score).toBe(2);
    });
});

describe('dedupeSectionsWithLog', () => {
    it('дубли — одно предупреждение с кодами и числом записей; без дублей лог молчит', () => {
        const warn = jest.fn();
        const merged = dedupeSectionsWithLog(
            [
                section('GREETING', 100),
                section('GREETING', 40),
                section('GREETING', 100),
                section('PRICE', 100),
                section('PRICE', 100),
            ],
            'transcription 42',
            { warn },
        );
        expect(merged.map(item => item.section)).toEqual(['GREETING', 'PRICE']);
        expect(warn).toHaveBeenCalledTimes(1);
        expect((warn.mock.calls[0] as [string])[0]).toContain(
            'transcription 42: модель прислала несколько записей одного раздела — GREETING ×3, PRICE ×2',
        );

        warn.mockClear();
        dedupeSectionsWithLog([section('NEEDS', 50)], 'x', { warn });
        expect(warn).not.toHaveBeenCalled();
    });
});
