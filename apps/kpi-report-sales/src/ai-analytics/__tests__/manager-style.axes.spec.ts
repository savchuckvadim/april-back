import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import type { StyleCrmManagerMonth } from '../domain/loaders/style-crm.types';
import {
    axesOf,
    crmStyleRows,
    funnelFocusOf,
    initiativeOf,
    pricePositionOf,
    STYLE_INQUIRY_SECTIONS,
} from '../domain/assembler/manager-style.axes';
import { buildStyleRows } from '../domain/assembler/manager-style.assembler';

/** Lite-строка разбора: по умолчанию без маркеров стиля. */
function liteRow(overrides: Partial<DatedLiteRow> = {}): DatedLiteRow {
    return {
        transcriptionId: 't1',
        managerId: '7',
        callStartedAt: new Date('2026-08-03T10:00:00Z'),
        durationSec: 300,
        callType: 'call',
        analysisPresent: true,
        score: 70,
        nextStep: null,
        riskFlags: [],
        coachingPriority: null,
        sections: [],
        objections: [],
        versions: null,
        ...overrides,
    } as DatedLiteRow;
}

const section = (code: string, score: number) => ({
    section: code,
    relevance: 1,
    score,
    asWas: null,
    alternatives: [],
});

describe('axesOf', () => {
    it('inquiry — контраст «потребности минус презентация»', () => {
        const row = liteRow({
            sections: [
                section(STYLE_INQUIRY_SECTIONS.plus, 8),
                section(STYLE_INQUIRY_SECTIONS.minus, 5),
            ],
        });

        expect(axesOf(row).inquiry).toBe(3);
    });

    it('раздел с relevance 0 маркера не даёт (ось молчит)', () => {
        const row = liteRow({
            sections: [
                { ...section(STYLE_INQUIRY_SECTIONS.plus, 8), relevance: 0 },
                section(STYLE_INQUIRY_SECTIONS.minus, 5),
            ],
        });

        expect(axesOf(row).inquiry).toBeUndefined();
    });

    it('initiative — доля речи менеджера из разбора', () => {
        const row = liteRow({
            style: {
                talkRatioPct: 58,
                questionsCount: 12,
                needsFound: null,
                needsCount: null,
                presentationDone: null,
                productsOfferedCount: null,
                priceDiscussed: true,
                competitorsCount: null,
                refusalCategory: null,
                interlocutorRole: null,
                productive: null,
                scriptCompliance: null,
                callDirection: null,
            },
        });

        expect(initiativeOf(row)).toBe(58);
        expect(pricePositionOf(row)).toBe(1);
        expect(axesOf(row)).toEqual({
            initiative: 58,
            price_position: 1,
            funnel_focus: 0,
        });
    });

    it('без блока style оси разбора молчат, а не подставляют ноль', () => {
        const row = liteRow({ callType: 'other' });

        expect(initiativeOf(row)).toBeNull();
        expect(pricePositionOf(row)).toBeNull();
        expect(axesOf(row)).toEqual({});
    });

    it('funnel_focus — поздняя стадия 1, ранняя 0, прочие типы молчат', () => {
        expect(funnelFocusOf(liteRow({ callType: 'presentation' }))).toBe(1);
        expect(funnelFocusOf(liteRow({ callType: 'payment' }))).toBe(1);
        expect(funnelFocusOf(liteRow({ callType: 'cold' }))).toBe(0);
        expect(funnelFocusOf(liteRow({ callType: 'irrelevant' }))).toBeNull();
        expect(funnelFocusOf(liteRow({ callType: null }))).toBeNull();
    });
});

describe('buildStyleRows', () => {
    const counters: StyleCrmManagerMonth = {
        managerId: '7',
        units: {
            attemptsPerLead: [2, 3],
            callsPerWorkday: [10, 14],
            rhythmPerWorkday: [-1.6, -1.6],
            // Ряды под-осей «звонки» и «лиды» в строки осей не идут.
            conversationSecByType: {
                outgoing: [120, 300],
                incoming: [90],
                incomingRedirect: [],
                callback: [],
            },
            leadResponseMin: [60],
        },
        attemptsMedian: 2.5,
        giveUpEvents: 2,
        giveUps: 1,
        giveUpRate: 0.5,
        promises: 0,
        promisesKept: 0,
        promiseKeptRate: null,
        leadResponseMinMedian: null,
        conversationSecMedian: null,
        conversationSecMedianByType: {
            outgoing: null,
            incoming: null,
            incomingRedirect: null,
            callback: null,
        },
        dispersionIndex: null,
        incomingShare: null,
        callsPerWorkdayMean: 12,
        calls: 24,
        workdays: 2,
    };

    it('единицы телефонии идут своими строками и не смешиваются с звонками', () => {
        const rows = buildStyleRows(
            [
                liteRow({
                    sections: [
                        section(STYLE_INQUIRY_SECTIONS.plus, 7),
                        section(STYLE_INQUIRY_SECTIONS.minus, 6),
                    ],
                }),
            ],
            [counters],
        );

        expect(rows).toEqual([
            { managerId: '7', axes: { inquiry: 1, funnel_focus: 0 } },
            { managerId: '7', axes: { persistence: 2 } },
            { managerId: '7', axes: { persistence: 3 } },
            { managerId: '7', axes: { tempo: 10 } },
            { managerId: '7', axes: { tempo: 14 } },
            { managerId: '7', axes: { rhythm: -1.6 } },
            { managerId: '7', axes: { rhythm: -1.6 } },
        ]);
    });

    it('разбор без менеджера или без анализа строку не даёт', () => {
        const rows = buildStyleRows([
            liteRow({ managerId: null }),
            liteRow({ analysisPresent: false }),
        ]);

        expect(rows).toEqual([]);
    });

    it('crmStyleRows без счётчиков — пустой список', () => {
        expect(crmStyleRows([])).toEqual([]);
    });
});
