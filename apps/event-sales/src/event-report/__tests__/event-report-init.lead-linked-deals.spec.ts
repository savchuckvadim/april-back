import { EventReportInitService } from '../services/init/event-report-init.service';

/**
 * «Звонки» из карточки лида находят сделку работы и по нашим ссылкам сделки
 * на лид («из лида», «присоединённые»), а не только по штатному LEAD_ID:
 * перевод лида 16.09 LEAD_ID не записал, и отчёт из лида сделку не видел
 * (garant 13–14.11.2026).
 */
describe('EventReportInitService: сделки лида по ссылкам сделки на лид', () => {
    const service = new EventReportInitService();
    const queue = (
        portal: object,
    ): { cmd: string; filter: Record<string, string> }[] => {
        const calls: { cmd: string; filter: Record<string, string> }[] = [];
        const bitrix = {
            batch: {
                deal: {
                    getList: (cmd: string, filter: Record<string, string>) =>
                        calls.push({ cmd, filter }),
                },
            },
        };
        (
            service as unknown as {
                queueLeadLinkedDealsLoad: (
                    b: object,
                    p: object,
                    leadId: number,
                    select: string[],
                ) => void;
            }
        ).queueLeadLinkedDealsLoad(bitrix, portal, 350711, ['ID']);
        return calls;
    };

    it('ищет по «присоединённым лидам» и «из лида»', () => {
        const portal = {
            getEntityFieldByCode: (_entity: string, code: string) =>
                ({
                    deal_joined_leads: { bitrixId: 'DEAL_JOINED_LEADS' },
                    deal_from_lead_id: { bitrixId: 'DEAL_FROM_LEAD_ID' },
                })[code],
        };
        expect(queue(portal)).toEqual([
            {
                cmd: 'list_deals_by_joined_lead',
                filter: { UF_CRM_DEAL_JOINED_LEADS: 'L_350711' },
            },
            {
                cmd: 'list_deals_from_lead',
                filter: { UF_CRM_DEAL_FROM_LEAD_ID: 'L_350711' },
            },
        ]);
    });

    it('полей нет на портале — лишних запросов нет', () => {
        expect(queue({ getEntityFieldByCode: () => undefined })).toEqual([]);
    });
});
