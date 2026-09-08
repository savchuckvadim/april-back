import { CALL_REPORT_TYPE_PROFILES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    APPLICABILITY_DEFAULTS,
    applicableSections,
    buildApplicability,
    countApplicableSections,
    filterApplicableSections,
    isSectionApplicable,
} from '../model/applicability';

describe('buildApplicability', () => {
    it('выводится из профилей типов: «холодный × презентация» неприменим', () => {
        const table = buildApplicability();

        expect(table.minRelevance).toBe(APPLICABILITY_DEFAULTS.minRelevance);
        expect(isSectionApplicable(table, 'cold', 'PRESENTATION')).toBe(false);
        expect(isSectionApplicable(table, 'cold', 'GREETING')).toBe(true);
        expect(isSectionApplicable(table, 'presentation', 'PRESENTATION')).toBe(
            true,
        );
    });

    it('порог применимости 30: приор 20 не проходит, приор 40 проходит', () => {
        const table = buildApplicability();
        const cold = table.cells.find(
            cell => cell.callType === 'cold' && cell.section === 'PRESENTATION',
        );
        const site = table.cells.find(
            cell =>
                cell.callType === 'site_lead' &&
                cell.section === 'PRESENTATION',
        );

        expect(cold).toEqual({
            callType: 'cold',
            section: 'PRESENTATION',
            relevance: 20,
            applicable: false,
        });
        expect(site?.relevance).toBe(40);
        expect(site?.applicable).toBe(true);
    });

    it('порог задаётся вызовом: при 10 презентация в холодном применима', () => {
        const table = buildApplicability(CALL_REPORT_TYPE_PROFILES, 10);

        expect(table.minRelevance).toBe(10);
        expect(isSectionApplicable(table, 'cold', 'PRESENTATION')).toBe(true);
    });

    it('применимые разделы холодного звонка — пять из семи', () => {
        const table = buildApplicability();

        expect(applicableSections(table, 'cold')).toEqual([
            'GREETING',
            'NEEDS',
            'OBJECTIONS',
            'CLOSING',
            'REFUSAL',
        ]);
        expect(countApplicableSections(table, 'cold')).toBe(5);
    });

    it('тип звонка неизвестен — гейт не вычёркивает разделы', () => {
        const table = buildApplicability();

        expect(isSectionApplicable(table, null, 'PRESENTATION')).toBe(true);
        expect(countApplicableSections(table, 'other-unknown')).toBe(7);
    });

    it('профили типов только читаются, таблица их не меняет', () => {
        const before =
            CALL_REPORT_TYPE_PROFILES.cold.sectionRelevance.PRESENTATION;

        buildApplicability(CALL_REPORT_TYPE_PROFILES, 90);

        expect(
            CALL_REPORT_TYPE_PROFILES.cold.sectionRelevance.PRESENTATION,
        ).toBe(before);
    });
});

describe('filterApplicableSections', () => {
    const sections = [
        { section: 'GREETING', relevance: 100, score: 8 },
        { section: 'PRESENTATION', relevance: 60, score: 9 },
        { section: 'CLOSING', relevance: 0, score: 7 },
    ];

    it('раздел с нулевой применимостью в счёт n_j не входит', () => {
        const table = buildApplicability();

        expect(
            filterApplicableSections(sections, 'cold', table).map(
                item => item.section,
            ),
        ).toEqual(['GREETING']);
    });

    it('для презентации тот же раздел в счёт входит', () => {
        const table = buildApplicability();

        expect(
            filterApplicableSections(sections, 'presentation', table).map(
                item => item.section,
            ),
        ).toEqual(['GREETING', 'PRESENTATION']);
    });
});
