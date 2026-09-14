import 'reflect-metadata';
import type { AiScoringSettings } from '@lib/sales-ai-analytics';
import {
    buildManagerWeekPayload,
    emptyWeekPayload,
    periodMatrixOptions,
    toAnalysisVersions,
} from '../domain/assembler/manager-week.assembler';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

const META = {
    calcVersion: 'sam-1.0.0',
    paramsVersion: 'pv-1',
    comparableFrom: null,
    generatedAt: '2026-09-07T00:15:00.000Z',
    modelSnapshotId: null,
};

const VERSIONS = {
    prompt: 'focus-v2.1-2026-05-01',
    rubric: 'rubric-v3',
    registry: 'reg-1',
    attribution: '2026-01-01',
    classifier: 'cls-1',
};

/** Разбор с оценёнными разделами (по умолчанию — закрытие на 9 баллов). */
function callRow(
    id: string,
    overrides: Partial<DatedLiteRow> = {},
): DatedLiteRow {
    return liteRow({
        transcriptionId: id,
        callStartedAt: new Date('2026-09-01T09:00:00Z'),
        sections: [
            {
                section: 'CLOSING',
                relevance: 80,
                score: 9,
                asWas: 'Ну это самое, я перезвоню',
                alternatives: [],
            },
        ],
        ...overrides,
    }) as DatedLiteRow;
}

/** Восемь разборов подряд: с меньшим n средняя раздела честно молчит. */
function callRows(
    prefix: string,
    overrides: Partial<DatedLiteRow> = {},
): DatedLiteRow[] {
    return Array.from({ length: 8 }, (_, index) =>
        callRow(`${prefix}-${index}`, overrides),
    );
}

/** Правило «нет даты следующего шага → закрытие не выше 5». */
const capRules: AiScoringSettings = {
    caps: [
        {
            ruleCode: 'closing-no-next-step-date',
            condition: 'nextStep.date = null',
            section: 'CLOSING',
            maxScore: 5,
            flag: 'no-next-step-date',
        },
    ],
    stopWords: [],
};

const input = (
    rows: DatedLiteRow[],
    overrides: Partial<Parameters<typeof buildManagerWeekPayload>[0]> = {},
) =>
    buildManagerWeekPayload({
        weekKey: '2026-W36',
        rows,
        scoring: { caps: [], stopWords: [] },
        comparableFrom: null,
        timeZone: 'Europe/Moscow',
        meta: META,
        ...overrides,
    });

describe('buildManagerWeekPayload — неделя менеджера', () => {
    it('неделя без разборов не создаёт запись', () => {
        const assembly = input([]);

        expect(assembly.rows).toEqual([]);
        expect(assembly.analyzed).toBe(0);
    });

    it('звонок без разбора записи не создаёт: строк ряда нет', () => {
        const assembly = input([
            callRow('t-1', { analysisPresent: false, sections: [] }),
        ]);

        expect(assembly.rows).toEqual([]);
    });

    it('снапшот несёт объём, оценку, корзины и типы менеджера', () => {
        const assembly = input([callRow('t-1'), callRow('t-2')]);

        expect(assembly.rows).toHaveLength(1);
        const payload = assembly.rows[0].payload;
        expect(assembly.rows[0].managerId).toBe('10');
        expect(payload.n).toBe(2);
        expect(payload.buckets).not.toHaveLength(0);
        expect(
            payload.byType.some(cell => cell.callType === 'presentation'),
        ).toBe(true);
        expect(payload.meta).toEqual(META);
    });
});

describe('Граница сравнимой истории', () => {
    it('звонки до comparableFrom считаются отдельно и в оценку не идут', () => {
        const assembly = input(
            [
                callRow('old', {
                    callStartedAt: new Date('2026-08-25T09:00:00Z'),
                }),
                callRow('new'),
            ],
            { comparableFrom: '2026-08-31' },
        );

        const payload = assembly.rows[0].payload;
        expect(payload.n).toBe(1);
        expect(payload.nBeforeComparable).toBe(1);
        expect(payload.comparableFrom).toBe('2026-08-31');
    });

    it('одна сигнатура версий — versions заполнены, versionsMixed = false', () => {
        const assembly = input([
            callRow('t-1', { versions: VERSIONS }),
            callRow('t-2', { versions: VERSIONS }),
        ]);

        expect(assembly.rows[0].payload.versions).toEqual(VERSIONS);
        expect(assembly.rows[0].payload.versionsMixed).toBe(false);
    });

    it('две сигнатуры версий в неделе — versionsMixed', () => {
        const assembly = input([
            callRow('t-1', { versions: VERSIONS }),
            callRow('t-2', {
                versions: { ...VERSIONS, rubric: 'rubric-v4' },
            }),
        ]);

        expect(assembly.rows[0].payload.versionsMixed).toBe(true);
    });

    it('неполная карта версий разбора версиями не считается', () => {
        expect(toAnalysisVersions({ prompt: 'p' })).toBeNull();
        expect(toAnalysisVersions(null)).toBeNull();
    });
});

/**
 * Порог «разбираемого» звонка — карта по типам (реестр
 * `min_duration_sec_by_type`, аудит Фазы 2, M2): матрица и срез
 * возражений режут одни и те же звонки.
 */
describe('Порог длительности по типам звонков', () => {
    const byType = { cold: 60, presentation: 300 };
    const objectionRow = (id: string, overrides: Partial<DatedLiteRow>) =>
        callRow(id, {
            objections: [
                {
                    category: 'price',
                    quote: null,
                    handled: true,
                    outcome: 'continued',
                },
            ],
            ...overrides,
        });
    /** 8 холодных по 90 с и 8 презентаций по 90 с, в каждом — возражение. */
    const rows = () => [
        ...Array.from({ length: 8 }, (_, index) =>
            objectionRow(`c-${index}`, { callType: 'cold', durationSec: 90 }),
        ),
        ...Array.from({ length: 8 }, (_, index) =>
            objectionRow(`p-${index}`, {
                callType: 'presentation',
                durationSec: 90,
            }),
        ),
    ];

    it('cold 60 / presentation 300: холодные 90 с в неделе, презентации 90 с — нет, возражения — той же картой', () => {
        const assembly = input(rows(), { minDurationSecByType: byType });

        const payload = assembly.rows[0].payload;
        expect(assembly.analyzed).toBe(8);
        expect(payload.n).toBe(8);
        expect(payload.byType.map(cell => [cell.callType, cell.n])).toEqual([
            ['cold', 8],
        ]);
        expect(payload.objections).toEqual([
            expect.objectContaining({ category: 'price', n: 8, calls: 8 }),
        ]);
    });

    it('без карты порог 300 с на все типы — те же строки дают неделю без записей', () => {
        expect(input(rows()).rows).toEqual([]);
    });

    it('опции матрицы периода: карта и граница кладутся только когда заданы', () => {
        expect(
            periodMatrixOptions({ comparableFrom: null, timeZone: 'UTC' }),
        ).toEqual({ timeZone: 'UTC' });
        expect(
            periodMatrixOptions({
                minDurationSecByType: byType,
                comparableFrom: '2026-09-01',
                timeZone: 'UTC',
            }),
        ).toEqual({
            minDurationSecByType: byType,
            comparableFrom: '2026-09-01',
            timeZone: 'UTC',
        });
    });
});

describe('Маркер недели без разборов', () => {
    it('портальное зерно: empty, n = 0, причина week-no-analysis и версии расчёта', () => {
        expect(emptyWeekPayload(META)).toEqual({
            empty: true,
            n: 0,
            reason: 'week-no-analysis',
            meta: META,
        });
    });
});

describe('Потолки оценивания и стоп-фразы', () => {
    it('правило «нет даты следующего шага» режет балл и пишет флаг', () => {
        const assembly = input(
            callRows('t', { nextStep: { set: true, date: null } }),
            { scoring: capRules },
        );

        const payload = assembly.rows[0].payload;
        expect(payload.flags).toEqual(['no-next-step-date']);
        expect(payload.caps).toEqual([
            {
                ruleCode: 'closing-no-next-step-date',
                section: 'CLOSING',
                flag: 'no-next-step-date',
                maxScore: 5,
                calls: 8,
                cut: 8,
            },
        ]);
        const closing = payload.byType[0].sections.find(
            section => section.section === 'CLOSING',
        );
        expect(closing?.avgScore).toBe(5);
    });

    it('дата следующего шага есть — правило не срабатывает', () => {
        const assembly = input(callRows('t'), { scoring: capRules });

        expect(assembly.rows[0].payload.flags).toEqual([]);
        expect(assembly.rows[0].payload.caps).toEqual([]);
        const closing = assembly.rows[0].payload.byType[0].sections.find(
            section => section.section === 'CLOSING',
        );
        expect(closing?.avgScore).toBe(9);
    });

    it('битое условие правила уезжает в capsSkipped, балл не трогается', () => {
        const assembly = input(callRows('t'), {
            scoring: {
                caps: [
                    {
                        ruleCode: 'broken',
                        condition: 'не условие вовсе',
                        section: 'CLOSING',
                        maxScore: 5,
                        flag: 'broken-flag',
                    },
                ],
                stopWords: [],
            },
        });

        expect(assembly.capsSkipped).toEqual([
            { ruleCode: 'broken', reason: 'bad-condition' },
        ]);
        expect(assembly.rows[0].payload.flags).toEqual([]);
    });

    it('стоп-фраза из цитаты разбора попадает в снапшот и балл не меняет', () => {
        const assembly = input(callRows('t'), {
            scoring: { caps: [], stopWords: ['я перезвоню'] },
        });

        const payload = assembly.rows[0].payload;
        expect(payload.stopWords).toEqual(['я перезвоню']);
        const closing = payload.byType[0].sections.find(
            section => section.section === 'CLOSING',
        );
        expect(closing?.avgScore).toBe(9);
    });
});

describe('Применимость разделов рубрики', () => {
    /** Холодный звонок: «презентация» (приор 20) к нему неприменима. */
    const coldRows = (): DatedLiteRow[] =>
        callRows('cold', {
            callType: 'cold',
            sections: [
                {
                    section: 'GREETING',
                    relevance: 90,
                    score: 8,
                    asWas: null,
                    alternatives: [],
                },
                {
                    section: 'PRESENTATION',
                    relevance: 70,
                    score: 2,
                    asWas: null,
                    alternatives: [],
                },
            ],
        });

    it('неприменимый раздел не попадает в знаменатель типа', () => {
        const payload = input(coldRows()).rows[0].payload;

        const codes = payload.byType[0].sections.map(
            section => section.section,
        );
        expect(codes).toEqual(['GREETING']);
    });

    it('вычеркнутый раздел виден в снапшоте с порогом и числом разборов', () => {
        const payload = input(coldRows()).rows[0].payload;

        expect(payload.applicability).toEqual({
            minRelevance: 30,
            excluded: [{ callType: 'cold', section: 'PRESENTATION', calls: 8 }],
        });
    });

    it('применимый раздел типа не вычёркивается', () => {
        const payload = input(callRows('t')).rows[0].payload;

        expect(payload.applicability.excluded).toEqual([]);
        expect(payload.byType[0].sections[0].section).toBe('CLOSING');
    });

    it('потолок портала неприменимый раздел не трогает', () => {
        const assembly = input(
            coldRows().map(row => ({
                ...row,
                nextStep: { set: true, date: null },
            })),
            {
                scoring: {
                    caps: [
                        {
                            ruleCode: 'presentation-no-next-step-date',
                            condition: 'nextStep.date = null',
                            section: 'PRESENTATION',
                            maxScore: 5,
                            flag: 'no-next-step-date',
                        },
                    ],
                    stopWords: [],
                },
            },
        );

        expect(assembly.rows[0].payload.caps).toEqual([]);
        expect(assembly.capsSkipped).toEqual([
            {
                ruleCode: 'presentation-no-next-step-date',
                reason: 'no-section',
            },
        ]);
    });
});
