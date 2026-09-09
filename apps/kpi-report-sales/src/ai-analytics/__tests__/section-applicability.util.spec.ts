import 'reflect-metadata';
import {
    applicabilityTraceOf,
    applySectionApplicability,
} from '../domain/assembler/section-applicability.util';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { liteRow } from './fixtures/lite-row.fixture';

/** Раздел разбора с оценкой (relevance разбора применимость не решает). */
const section = (code: string) => ({
    section: code,
    relevance: 70,
    score: 7,
    asWas: null,
    alternatives: [] as string[],
});

function row(id: string, overrides: Partial<DatedLiteRow> = {}): DatedLiteRow {
    return liteRow({
        transcriptionId: id,
        sections: [section('GREETING'), section('PRESENTATION')],
        ...overrides,
    }) as DatedLiteRow;
}

describe('applySectionApplicability — применимость разделов к типу', () => {
    it('раздел ниже порога приора вычёркивается из строки', () => {
        const result = applySectionApplicability([
            row('t-1', { callType: 'cold' }),
        ]);

        expect(result.rows[0].sections.map(item => item.section)).toEqual([
            'GREETING',
        ]);
        expect(result.minRelevance).toBe(30);
    });

    it('вход не мутируется: исходная строка сохраняет свои разделы', () => {
        const source = row('t-1', { callType: 'cold' });

        applySectionApplicability([source]);

        expect(source.sections).toHaveLength(2);
    });

    it('применимые разделы типа остаются, строка не копируется зря', () => {
        const source = row('t-1', { callType: 'presentation' });
        const result = applySectionApplicability([source]);

        expect(result.rows[0]).toBe(source);
        expect(result.byManager.size).toBe(0);
    });

    it('неизвестный тип звонка проходит целиком — данные не теряем', () => {
        const result = applySectionApplicability([
            row('t-1', { callType: null }),
            row('t-2', { callType: 'нет такого типа' }),
        ]);

        expect(result.rows[0].sections).toHaveLength(2);
        expect(result.rows[1].sections).toHaveLength(2);
        expect(result.byManager.size).toBe(0);
    });

    it('след считает разборы и упорядочен по типу и разделу', () => {
        const result = applySectionApplicability([
            row('t-1', { callType: 'payment' }),
            row('t-2', { callType: 'cold' }),
            row('t-3', { callType: 'cold' }),
        ]);

        expect(applicabilityTraceOf(result, '10')).toEqual({
            minRelevance: 30,
            excluded: [
                { callType: 'cold', section: 'PRESENTATION', calls: 2 },
                { callType: 'payment', section: 'GREETING', calls: 1 },
                { callType: 'payment', section: 'PRESENTATION', calls: 1 },
            ],
        });
    });

    it('строка без менеджера в след не идёт и разбор не роняет', () => {
        const result = applySectionApplicability([
            row('t-1', { callType: 'cold', managerId: null }),
        ]);

        expect(result.byManager.size).toBe(0);
        expect(result.rows[0].sections).toHaveLength(1);
    });

    it('менеджера в следе нет — трактовка пустая, а не undefined', () => {
        const result = applySectionApplicability([]);

        expect(applicabilityTraceOf(result, '77')).toEqual({
            minRelevance: 30,
            excluded: [],
        });
    });
});
