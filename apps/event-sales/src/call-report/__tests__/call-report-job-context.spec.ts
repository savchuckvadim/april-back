import { callReportJobCallContext } from '../queue/call-report-job-context';

describe('callReportJobCallContext — подпись джобов разбора звонков', () => {
    it('звонок по сделке: портал, сделка и кто звонил', () => {
        expect(
            callReportJobCallContext({
                domain: 'gsr.bitrix24.ru',
                dealId: 26735,
                callerUserId: 325,
            }),
        ).toEqual({
            domain: 'gsr.bitrix24.ru',
            entity: { type: 'deal', id: '26735' },
            actor: { userId: 325 },
        });
    });

    it('звонок по лиду: в dealId лежит id лида', () => {
        expect(
            callReportJobCallContext({
                domain: 'gsr.bitrix24.ru',
                dealId: 42,
                entityType: 'lead',
            }).entity,
        ).toEqual({ type: 'lead', id: '42' });
    });

    it('джоб по порталу (догон, переразбор) — только портал', () => {
        expect(callReportJobCallContext({ domain: 'gsr.bitrix24.ru' })).toEqual(
            { domain: 'gsr.bitrix24.ru', entity: undefined, actor: undefined },
        );
    });
});
