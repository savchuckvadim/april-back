import { AnalysisSection } from '../model/sections.util';
import {
    ScoringFacts,
    applyScoringCaps,
    findStopWords,
    findStopWordsInSections,
    matchesCondition,
    parseCapCondition,
} from '../model/scoring-caps';
import type { AiScoringCapRule } from '../settings/ai-settings.types';

const section = (
    code: string,
    score: number | null,
    relevance = 90,
): AnalysisSection => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});

/** Правило владельца: нет даты следующего шага → закрытие не выше 5. */
const NO_NEXT_STEP: AiScoringCapRule = {
    ruleCode: 'closing-without-next-step',
    condition: 'nextStep.set = false',
    section: 'CLOSING',
    maxScore: 5,
    flag: 'no-next-step',
};

const facts = (values: ScoringFacts): ScoringFacts => values;

describe('parseCapCondition', () => {
    it('разбирает «факт оператор значение» и одиночный факт', () => {
        expect(parseCapCondition('nextStep.set = false')).toEqual({
            fact: 'nextStep.set',
            operator: '=',
            value: false,
        });
        expect(parseCapCondition('durationSec < 300')).toEqual({
            fact: 'durationSec',
            operator: '<',
            value: 300,
        });
        expect(parseCapCondition('priceDiscussed')).toEqual({
            fact: 'priceDiscussed',
            operator: '=',
            value: true,
        });
    });

    it('пустое и неразбираемое условие — null', () => {
        expect(parseCapCondition('')).toBeNull();
        expect(parseCapCondition('нет даты следующего шага')).toBeNull();
    });

    it('порядковые операторы работают только с числами', () => {
        const condition = parseCapCondition('durationSec >= 300') ?? {
            fact: 'durationSec',
            operator: '>=' as const,
            value: 300,
        };

        expect(condition.operator).toBe('>=');
        expect(matchesCondition(condition, facts({ durationSec: 420 }))).toBe(
            true,
        );
        expect(
            matchesCondition(condition, facts({ durationSec: 'много' })),
        ).toBe(false);
    });
});

describe('applyScoringCaps', () => {
    it('правило потолка режет балл раздела и пишет флаг', () => {
        const sections = [section('CLOSING', 8), section('NEEDS', 7)];

        const result = applyScoringCaps(
            sections,
            [NO_NEXT_STEP],
            facts({ 'nextStep.set': false }),
        );

        expect(result.sections[0].score).toBe(5);
        expect(result.sections[1].score).toBe(7);
        expect(result.flags).toEqual(['no-next-step']);
        expect(result.applied).toEqual([
            {
                ruleCode: 'closing-without-next-step',
                section: 'CLOSING',
                flag: 'no-next-step',
                maxScore: 5,
                scoreBefore: 8,
                scoreAfter: 5,
                cut: true,
            },
        ]);
        expect(sections[0].score).toBe(8);
    });

    it('условие ложно — балл не трогается и флага нет', () => {
        const result = applyScoringCaps(
            [section('CLOSING', 8)],
            [NO_NEXT_STEP],
            facts({ 'nextStep.set': true }),
        );

        expect(result.sections[0].score).toBe(8);
        expect(result.flags).toEqual([]);
        expect(result.applied).toEqual([]);
    });

    it('балл и так не выше потолка — флаг ставится, срез не нужен', () => {
        const result = applyScoringCaps(
            [section('CLOSING', 4)],
            [NO_NEXT_STEP],
            facts({ 'nextStep.set': false }),
        );

        expect(result.sections[0].score).toBe(4);
        expect(result.flags).toEqual(['no-next-step']);
        expect(result.applied[0].cut).toBe(false);
    });

    it('факта нет в разборе — правило пропускается с причиной', () => {
        const result = applyScoringCaps(
            [section('CLOSING', 9)],
            [NO_NEXT_STEP],
            facts({}),
        );

        expect(result.sections[0].score).toBe(9);
        expect(result.skipped).toEqual([
            {
                ruleCode: 'closing-without-next-step',
                reason: 'unknown-fact',
            },
        ]);
    });

    it('раздела в разборе нет или он не оценён — потолок не применяется', () => {
        const missing = applyScoringCaps(
            [section('NEEDS', 8)],
            [NO_NEXT_STEP],
            facts({ 'nextStep.set': false }),
        );
        const unscored = applyScoringCaps(
            [section('CLOSING', null)],
            [NO_NEXT_STEP],
            facts({ 'nextStep.set': false }),
        );

        expect(missing.skipped[0].reason).toBe('no-section');
        expect(unscored.skipped[0].reason).toBe('no-section');
        expect(unscored.flags).toEqual([]);
    });

    it('неразбираемое условие не роняет расчёт', () => {
        const result = applyScoringCaps(
            [section('CLOSING', 9)],
            [{ ...NO_NEXT_STEP, condition: 'закрытие без даты' }],
            facts({ 'nextStep.set': false }),
        );

        expect(result.sections[0].score).toBe(9);
        expect(result.skipped[0].reason).toBe('bad-condition');
    });

    it('несколько правил применяются по порядку, флаги без повторов', () => {
        const short: AiScoringCapRule = {
            ruleCode: 'short-call',
            condition: 'durationSec < 300',
            section: 'CLOSING',
            maxScore: 3,
            flag: 'no-next-step',
        };

        const result = applyScoringCaps(
            [section('CLOSING', 9)],
            [NO_NEXT_STEP, short],
            facts({ 'nextStep.set': false, durationSec: 120 }),
        );

        expect(result.sections[0].score).toBe(3);
        expect(result.flags).toEqual(['no-next-step']);
        expect(result.applied.map(item => item.scoreAfter)).toEqual([5, 3]);
    });
});

describe('findStopWords', () => {
    const dictionary = ['ничего не могу сделать', 'Дешевле не будет', 'ёлки'];

    it('стоп-фраза возвращается списком и балл не меняет', () => {
        const sections = [section('OBJECTIONS', 8)];
        const withText: AnalysisSection[] = [
            { ...sections[0], asWas: 'Ну ДЕШЕВЛЕ НЕ БУДЕТ, извините' },
        ];

        expect(findStopWordsInSections(withText, dictionary)).toEqual([
            'Дешевле не будет',
        ]);
        expect(withText[0].score).toBe(8);
    });

    it('регистр, ё и лишние пробелы не мешают поиску', () => {
        expect(
            findStopWords('Тут   елки  и\nдешевле  не будет', dictionary),
        ).toEqual(['Дешевле не будет', 'ёлки']);
    });

    it('без совпадений и на пустом тексте — пустой список', () => {
        expect(findStopWords('обычный разговор', dictionary)).toEqual([]);
        expect(findStopWords(null, dictionary)).toEqual([]);
        expect(findStopWords('дешевле не будет', [])).toEqual([]);
    });
});
