import { readCallPageAnalysis } from '../call-page-analysis.reader';
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
