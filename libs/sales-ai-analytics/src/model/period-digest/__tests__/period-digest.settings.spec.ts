import {
    EnumPortalAppCode,
    getPortalAppDefaults,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import { PERIOD_DIGEST_KIND } from '@lib/portal-lib/store/app-settings/lib/period-digest-kinds.const';
import { DIGEST_PERIOD_KIND } from '../period-digest.codes';
import { digestSettingsOf } from '../period-digest.settings';
import {
    DIGEST_DEFAULT_SHIFT,
    DIGEST_MIN_CALLS,
} from '../period-digest.thresholds';

describe('настройки портала → параметры карточки периода', () => {
    it('значения по умолчанию из реестра дают пороги карточки по умолчанию', () => {
        expect(
            digestSettingsOf(
                getPortalAppDefaults(EnumPortalAppCode.eventSales),
            ),
        ).toEqual({ minCalls: DIGEST_MIN_CALLS, shift: DIGEST_DEFAULT_SHIFT });
    });

    it('доля — из процентных пунктов, «на звонок» — всегда по умолчанию', () => {
        expect(
            digestSettingsOf({
                periodDigestMinCalls: 8,
                periodDigestShiftScore: 1,
                periodDigestShiftShare: 15,
            }),
        ).toEqual({
            minCalls: 8,
            shift: { score: 1, share: 0.15, perCall: 0.5 },
        });
    });

    it('мусор и значения вне границ — по умолчанию', () => {
        expect(
            digestSettingsOf({
                periodDigestMinCalls: 2.5,
                periodDigestShiftScore: 0,
                periodDigestShiftShare: 0.1,
            }),
        ).toEqual({ minCalls: 5, shift: DIGEST_DEFAULT_SHIFT });
        expect(
            digestSettingsOf({
                periodDigestMinCalls: 'много',
                periodDigestShiftScore: true,
                periodDigestShiftShare: '',
            }),
        ).toEqual({ minCalls: 5, shift: DIGEST_DEFAULT_SHIFT });
        expect(digestSettingsOf({})).toEqual({
            minCalls: 5,
            shift: DIGEST_DEFAULT_SHIFT,
        });
        // Строка с числом — из старых значений JSON — принимается.
        expect(digestSettingsOf({ periodDigestMinCalls: '7' }).minCalls).toBe(
            7,
        );
    });

    it('виды периодов в настройке — те же коды, что у карточки', () => {
        expect(Object.values(PERIOD_DIGEST_KIND)).toEqual(
            Object.values(DIGEST_PERIOD_KIND),
        );
    });
});
