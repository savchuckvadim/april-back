import 'reflect-metadata';
import type { AiScoringSettings } from '@lib/sales-ai-analytics';
import {
    buildManagerWeekPayload,
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
