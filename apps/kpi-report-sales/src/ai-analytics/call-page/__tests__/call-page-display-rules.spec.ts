import { readCallPageAnalysis } from '../call-page-analysis.reader';
import { buildCallPageFacts } from '../call-page-facts.presenter';
import type { CallPageAnalysisView } from '../call-page.types';

/**
 * Правила показа разбора на странице звонка (решения владельца 18.11.2026)
 * — применяются при чтении, поэтому действуют и на старые разборы.
 */
const viewOf = (payload: Record<string, unknown>): CallPageAnalysisView => {
    const view = readCallPageAnalysis(payload);
    if (view === null) throw new Error('разбор не прочитан');
    return view;
};

describe('страница звонка: соответствие скрипту', () => {
    it('скрипт был в разборе — процент показывается', () => {
        expect(
            viewOf({ scriptIncluded: true, scriptCompliance: 70 })
                .scriptCompliance,
        ).toBe(70);
    });

    it('скрипта не было — процент не показывается', () => {
        expect(
            viewOf({ scriptIncluded: false, scriptCompliance: 40 })
                .scriptCompliance,
        ).toBeNull();
    });

    it('старый разбор без признака — процент не показывается', () => {
        expect(viewOf({ scriptCompliance: 40 }).scriptCompliance).toBeNull();
    });
});

const CHECKLISTS = {
    hvostDone: true,
    hvostAnalysis: '1. ЖЕЛАНИЕ РАБОТАТЬ — ✓ понравилось',
    fiveKDone: false,
    fiveKAnalysis: 'КОЛЛЕГИ — не выяснено',
};

const checklistLabels = (payload: Record<string, unknown>): string[] =>
    buildCallPageFacts(viewOf(payload))
        .map(fact => fact.label)
        .filter(label => label.startsWith('Чек-лист'));

describe('страница звонка: чек-листы «Хвост» и 5К', () => {
    it('презентация — обе строки как раньше', () => {
        const view = viewOf({ callType: 'presentation', ...CHECKLISTS });
        expect(view.hvostDone).toBe(true);
        expect(view.fiveKAnalysis).toBe('КОЛЛЕГИ — не выяснено');
        expect(
            checklistLabels({ callType: 'presentation', ...CHECKLISTS }),
        ).toEqual(['Чек-лист ХВОСТ', 'Чек-лист 5К']);
    });

    it('старый разбор звонка по решению с чек-листами — строк нет', () => {
        const view = viewOf({ callType: 'decision', ...CHECKLISTS });
        expect(view.hvostDone).toBeNull();
        expect(view.hvostAnalysis).toBeNull();
        expect(view.fiveKDone).toBeNull();
        expect(view.fiveKAnalysis).toBeNull();
        expect(
            checklistLabels({ callType: 'decision', ...CHECKLISTS }),
        ).toEqual([]);
    });

    it('другой тип или тип не определён — строк нет', () => {
        expect(checklistLabels({ callType: 'cold', ...CHECKLISTS })).toEqual(
            [],
        );
        expect(checklistLabels({ ...CHECKLISTS })).toEqual([]);
    });
});
