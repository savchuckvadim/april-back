import { callReportCallTypeTitle } from '../pbx-aicall-smart.type';

describe('callReportCallTypeTitle — русское название типа звонка', () => {
    it('код → название из items смарта; незнакомый код как есть; пусто → null', () => {
        expect(callReportCallTypeTitle('presentation')).toBe('Презентация');
        expect(callReportCallTypeTitle('site_lead')).toBe('Заявка с сайта');
        expect(callReportCallTypeTitle('mystery')).toBe('mystery');
        expect(callReportCallTypeTitle(null)).toBeNull();
        expect(callReportCallTypeTitle(undefined)).toBeNull();
    });
});
