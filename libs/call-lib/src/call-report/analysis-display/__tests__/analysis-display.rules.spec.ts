import {
    CALL_ANALYSIS_CHECKLIST_FIELDS,
    CALL_REPORT_CHECKLIST_CALL_TYPES,
    callTypeHasChecklists,
    isScriptComplianceTrusted,
    trustedScriptCompliance,
} from '../analysis-display.rules';

describe('правила показа разбора: соответствие скрипту', () => {
    it('скрипт был в разборе — процент показывается', () => {
        expect(
            trustedScriptCompliance({
                scriptIncluded: true,
                scriptCompliance: 70,
            }),
        ).toBe(70);
        expect(isScriptComplianceTrusted({ scriptIncluded: true })).toBe(true);
    });

    it('скрипт был, но процента нет — null, а не 0', () => {
        expect(
            trustedScriptCompliance({
                scriptIncluded: true,
                scriptCompliance: null,
            }),
        ).toBeNull();
    });

    it('скрипта не было — процент модели не показывается', () => {
        expect(
            trustedScriptCompliance({
                scriptIncluded: false,
                scriptCompliance: 40,
            }),
        ).toBeNull();
    });

    it('старый разбор без признака — процент не показывается', () => {
        expect(trustedScriptCompliance({ scriptCompliance: 40 })).toBeNull();
        expect(isScriptComplianceTrusted({})).toBe(false);
    });

    it('признак не boolean или разбора нет — не верим', () => {
        expect(
            trustedScriptCompliance({
                scriptIncluded: 'true',
                scriptCompliance: 40,
            }),
        ).toBeNull();
        expect(trustedScriptCompliance(null)).toBeNull();
        expect(trustedScriptCompliance(undefined)).toBeNull();
    });

    it('процент не числом — значения нет', () => {
        expect(
            trustedScriptCompliance({
                scriptIncluded: true,
                scriptCompliance: '70',
            }),
        ).toBeNull();
    });
});

describe('правила показа разбора: чек-листы «Хвост» и 5К', () => {
    it('только у презентации', () => {
        expect(callTypeHasChecklists('presentation')).toBe(true);
    });

    it('звонок по решению, доработка и прочие типы — без чек-листов', () => {
        for (const callType of [
            'decision',
            'refine',
            'call',
            'cold',
            'other',
            'renewal-call',
        ]) {
            expect(callTypeHasChecklists(callType)).toBe(false);
        }
    });

    it('тип не определён — без чек-листов', () => {
        expect(callTypeHasChecklists(null)).toBe(false);
        expect(callTypeHasChecklists(undefined)).toBe(false);
        expect(callTypeHasChecklists(42)).toBe(false);
    });

    it('набор полей чек-листов — шесть полей разбора и места пунктов в разговоре', () => {
        expect([...CALL_ANALYSIS_CHECKLIST_FIELDS]).toEqual([
            'hvostDone',
            'hvostAnalysis',
            'hvostSteps',
            'fiveKDone',
            'fiveKAnalysis',
            'fiveKItems',
            'hvostEvidence',
            'fiveKEvidence',
        ]);
        expect([...CALL_REPORT_CHECKLIST_CALL_TYPES]).toEqual(['presentation']);
    });
});
