import {
    isScriptComplianceTrusted,
    trustedScriptCompliance,
} from '../analysis-display.rules';

describe('правила показа разбора: соответствие скрипту', () => {
    it('скрипт был в разборе — процент показывается', () => {
        expect(
            trustedScriptCompliance({ scriptIncluded: true, scriptCompliance: 70 }),
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
