import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { findParam } from '../params/registry.const';
import {
    defaultDefinitions,
    defaultTargets,
} from '../settings/ai-settings.defaults';
import {
    parseAiAbsences,
    parseAiDefinitions,
    parseAiEvents,
    parseAiHypothesis,
    parseAiLevels,
    parseAiManagerParams,
    parseAiModelParams,
    parseAiScoring,
    parseAiTargets,
    parseRosterConfirmedAt,
} from '../settings/ai-settings.parse';
import { AI_SETTINGS_KEY_CODES } from '../settings/ai-settings.types';

/** Строки, на которых обязан устоять любой парсер настройки. */
const BROKEN = ['', '   ', '{не json', 'null', '42', '"строка"', '[]{}'];

describe('Парсеры настроек: битый JSON даёт дефолт, а не исключение', () => {
    it('десять ключей объявлены и разбираются без исключений', () => {
        expect(AI_SETTINGS_KEY_CODES).toHaveLength(10);
        for (const json of BROKEN) {
            expect(() => parseAiLevels(json)).not.toThrow();
            expect(parseAiLevels(json)).toEqual([]);
            expect(parseAiAbsences(json)).toEqual({});
            expect(parseAiModelParams(json)).toEqual({});
            expect(parseAiManagerParams(json)).toEqual({});
            expect(parseAiEvents(json)).toEqual([]);
            expect(parseAiScoring(json)).toEqual({ caps: [], stopWords: [] });
            expect(parseAiHypothesis(json)).toBeNull();
            expect(parseRosterConfirmedAt(json)).toBe('');
            expect(parseAiTargets(json)).toEqual(defaultTargets());
            expect(parseAiDefinitions(json)).toEqual(defaultDefinitions());
        }
    });

    it('null и undefined равносильны пустой строке', () => {
        expect(parseAiLevels(null)).toEqual([]);
        expect(parseAiDefinitions(undefined)).toEqual(defaultDefinitions());
        expect(parseRosterConfirmedAt(null)).toBe('');
    });
});

describe('parseAiLevels', () => {
    it('чужие записи отбрасываются, дубли схлопываются к первой', () => {
        const levels = parseAiLevels(
            JSON.stringify([
                { managerId: 10, level: 'senior', since: '2025-03-01' },
                { managerId: 10, level: 'junior' },
                { managerId: 0, level: 'junior' },
                { managerId: 20, level: 'архитектор' },
                { managerId: 30, level: 'middle', since: 'вчера' },
            ]),
        );

        expect(levels).toEqual([
            {
                managerId: 10,
                level: 'senior',
                since: '2025-03-01',
                source: 'manual',
            },
            { managerId: 30, level: 'middle', since: null, source: 'manual' },
        ]);
    });
});

describe('parseAiTargets и parseAiAbsences', () => {
    it('цель вне диапазона превращается в «считать медианой»', () => {
        const targets = parseAiTargets(
            JSON.stringify({
                byLevel: {
                    junior: { sales: 3, presentationsMin: 25, coldPerDay: 50 },
                    senior: { sales: 500, presentationsMin: 0, coldPerDay: 20 },
                },
                overrides: { '10': 5, '20': null, abc: 7 },
            }),
        );

        expect(targets.byLevel.junior).toEqual({
            sales: 3,
            presentationsMin: 25,
            coldPerDay: 50,
        });
        expect(targets.byLevel.senior.sales).toBeNull();
        expect(targets.byLevel.middle).toEqual(defaultTargets().byLevel.middle);
        expect(targets.overrides).toEqual({ '10': 5, '20': null });
    });

    it('отсутствия сортируются, from > to отбрасывается', () => {
        const absences = parseAiAbsences(
            JSON.stringify({
                '10': [
                    { from: '2026-08-01', to: '2026-08-05', kind: 'sick' },
                    { from: '2026-07-01', to: '2026-07-14', kind: 'vacation' },
                    { from: '2026-09-10', to: '2026-09-01', kind: 'other' },
                ],
                '0': [{ from: '2026-07-01', to: '2026-07-02', kind: 'other' }],
            }),
        );

        expect(Object.keys(absences)).toEqual(['10']);
        expect(absences['10'].map(item => item.from)).toEqual([
            '2026-07-01',
            '2026-08-01',
        ]);
    });
});

describe('parseAiModelParams и parseAiManagerParams', () => {
    it('неизвестный код и значение чужого типа отбрасываются', () => {
        expect(
            parseAiModelParams(
                JSON.stringify({
                    forget_lambda: 0.9,
                    unknown_code: 1,
                    kappa_edge_early: { value: 100 },
                }),
            ),
        ).toEqual({ forget_lambda: 0.9 });
    });

    it('слой менеджера: ставка в границах, null снимает личную цель', () => {
        const params = parseAiManagerParams(
            JSON.stringify({
                '10': {
                    fteShare: 0.5,
                    targetOverride: null,
                    excludeFromNorms: true,
                    workweek: [1, 2, 3, 9],
                    timeZone: 'Asia/Novosibirsk',
                },
                '20': { fteShare: 5 },
                '30': {},
            }),
        );

        expect(params['10']).toEqual({
            fteShare: 0.5,
            targetOverride: null,
            excludeFromNorms: true,
            workweek: [1, 2, 3],
            timeZone: 'Asia/Novosibirsk',
        });
        expect(params['20']).toBeUndefined();
        expect(params['30']).toBeUndefined();
    });
});

describe('parseAiDefinitions', () => {
    it('порог длительности по умолчанию берётся из реестра', () => {
        const definitions = parseAiDefinitions('');
        const fromRegistry = findParam(
            'min_duration_sec_by_type',
        )?.defaultValue;

        for (const type of CALL_REPORT_CALL_TYPE_CODES) {
            expect(`${type}=${definitions.minDurationSecByType[type]}`).toBe(
                `${type}=${String(fromRegistry)}`,
            );
        }
    });

    it('заданные поля перекрывают дефолт, чужие значения — нет', () => {
        const definitions = parseAiDefinitions(
            JSON.stringify({
                productiveCall: 'ai_next_step_date',
                normStratum: 'команда',
                funnelEdges: ['e1', 'e9'],
                decisionStages: ['sales_in_progress', 'sales_unknown'],
                minDurationSecByType: { cold: 60, wrong: 10 },
                hotClient: 'stage_from:sales_pres',
            }),
        );

        expect(definitions.productiveCall).toBe('ai_next_step_date');
        expect(definitions.normStratum).toBe('tenure');
        expect(definitions.funnelEdges).toEqual(['e1']);
        expect(definitions.decisionStages).toEqual(['sales_in_progress']);
        expect(definitions.minDurationSecByType.cold).toBe(60);
        expect(definitions.minDurationSecByType.call).toBe(300);
        expect(definitions.hotStageCode).toBe('sales_pres');
    });
});

describe('parseAiScoring, parseAiHypothesis, parseAiEvents', () => {
    it('правила режутся по лимиту, стоп-фразы дедуплицируются', () => {
        const scoring = parseAiScoring(
            JSON.stringify({
                caps: [
                    ...Array.from({ length: 25 }, (_, index) => ({
                        ruleCode: `rule_${index}`,
                        section: 'CLOSING',
                        maxScore: 5,
                    })),
                    { ruleCode: 'bad', section: 'НЕТ', maxScore: 5 },
                ],
                stopWords: ['а', 'а', 'б', 1],
            }),
        );

        expect(scoring.caps).toHaveLength(20);
        expect(scoring.caps[0]).toEqual({
            ruleCode: 'rule_0',
            condition: '',
            section: 'CLOSING',
            maxScore: 5,
            flag: 'rule_0',
        });
        expect(scoring.stopWords).toEqual(['а', 'б']);
    });

    it('гипотеза меньше двух корректных пар → null', () => {
        expect(
            parseAiHypothesis(
                JSON.stringify({
                    pairs: [
                        { s: 8, n: 30 },
                        { s: 11, n: 50 },
                    ],
                }),
            ),
        ).toBeNull();
        expect(
            parseAiHypothesis(
                JSON.stringify({
                    pairs: [
                        { s: 8, n: 30 },
                        { s: 5, n: 50 },
                    ],
                    since: '2026-09-08',
                    author: '447',
                }),
            ),
        ).toEqual({
            pairs: [
                { s: 8, n: 30 },
                { s: 5, n: 50 },
            ],
            since: '2026-09-08',
            author: '447',
        });
    });

    it('журнал сортируется по дате, чужой вид события отбрасывается', () => {
        const events = parseAiEvents(
            JSON.stringify([
                { date: '2026-09-05', kind: 'script_change', source: 'manual' },
                { date: '2026-01-01', kind: 'new_hire', source: 'auto' },
                { date: '2026-02-01', kind: 'ремонт', source: 'manual' },
            ]),
        );

        expect(events.map(event => event.date)).toEqual([
            '2026-01-01',
            '2026-09-05',
        ]);
    });
});
