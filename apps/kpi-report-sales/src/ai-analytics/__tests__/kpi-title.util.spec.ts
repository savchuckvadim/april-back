import {
    kpiEventTitle,
    kpiReasonText,
} from '../domain/presenter/kpi-title.util';

describe('kpi-title.util — подписи KPI-фактов словами', () => {
    it('код item-а event_type → название показателя, чужой код — как есть', () => {
        expect(kpiEventTitle('call_in_money')).toBe('Звонок по оплате');
        expect(kpiEventTitle('presentation_uniq')).toBe(
            'Презентация(уникальная)',
        );
        expect(kpiEventTitle('xo')).toBe('Холодный звонок');
        expect(kpiEventTitle('custom_code')).toBe('custom_code');
    });

    it('причины карты типов и отсутствующий item — фразой, без кода', () => {
        expect(kpiReasonText('refine-mapped-to-call')).toBe(
            'доработки в KPI-списке считаются вместе со звонками',
        );
        expect(kpiReasonText('other-share-in-meta')).toBe(
            'тип «Другое» отдельным показателем не считается',
        );
        expect(kpiReasonText('irrelevant-share-in-meta')).toBe(
            'нерелевантные звонки отдельным показателем не считаются',
        );
        expect(kpiReasonText('kpi-item-missing:call_in_money')).toBe(
            'на портале нет показателя «Звонок по оплате»',
        );
        expect(kpiReasonText(undefined)).toBe('нет данных');
        expect(kpiReasonText('')).toBe('нет данных');
    });
});
