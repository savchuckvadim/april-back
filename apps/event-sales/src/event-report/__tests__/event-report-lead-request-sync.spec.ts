import { EventReportLeadRequestSyncService } from '../services/lead/event-report-lead-request-sync.service';

/**
 * Синк заявки на финалах: продажа/отказ двигают op_lead_* связанных лидов
 * и дописывают историю; не-финальные события не трогают лид вовсе.
 */
const FIELD_DEFS: Record<
    string,
    {
        bitrixId: string;
        items?: { code: string; name: string; bitrixId: number }[];
    }
> = {
    op_lead_status: {
        bitrixId: 'OP_LEAD_STATUS',
        items: [
            { code: 'op_lead_status_eight', name: 'Продажа', bitrixId: 8 },
            { code: 'op_lead_status_nine', name: 'Отказ', bitrixId: 9 },
            { code: 'op_lead_status_ten', name: 'Не ца', bitrixId: 10 },
        ],
    },
    op_lead_site_status: {
        bitrixId: 'OP_LEAD_SITE_STATUS',
        items: [
            { code: 'op_lead_site_status3', name: 'Не ЦА', bitrixId: 33 },
            {
                code: 'op_lead_site_status4',
                name: 'Ведётся активная работа',
                bitrixId: 34,
            },
            { code: 'op_lead_site_status5', name: 'Отказ', bitrixId: 55 },
        ],
    },
    op_lead_site_stage: {
        bitrixId: 'OP_LEAD_SITE_STAGE',
        items: [
            {
                code: 'op_lead_site_stage4',
                name: 'Проведена презентация',
                bitrixId: 84,
            },
            { code: 'op_lead_site_stage8', name: 'Отказ', bitrixId: 88 },
            { code: 'op_lead_site_stage9', name: 'Продажа', bitrixId: 99 },
        ],
    },
    to_presentation_sales: { bitrixId: 'TO_PRESENTATION_SALES' },
    op_lead_not_ca_type: {
        bitrixId: 'OP_LEAD_NOT_CA_TYPE',
        items: [
            {
                code: 'op_lead_not_ca_type4',
                name: 'Нет специалистов',
                bitrixId: 44,
            },
        ],
    },
    op_lead_is_boost_sale: { bitrixId: 'OP_LEAD_IS_BOOST_SALE' },
    op_lead_firstprepare_history: { bitrixId: 'OP_LEAD_FIRSTPREPARE_HISTORY' },
    deal_from_lead_id: { bitrixId: 'DEAL_FROM_LEAD_ID' },
    deal_joined_leads: { bitrixId: 'DEAL_JOINED_LEADS' },
};

const makePortal = () => ({
    getEntityFieldByCode: (_entity: string, code: string) => {
        const def = FIELD_DEFS[code];
        return def
            ? { bitrixId: def.bitrixId, items: def.items ?? [] }
            : undefined;
    },
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
    getTimezone: () => 'Europe/Moscow',
});

const makeBitrix = (leadRows: Record<number, Record<string, unknown>>) => {
    const updates: { leadId: number; fields: Record<string, unknown> }[] = [];
    const pendingGets: number[] = [];
    return {
        updates,
        bitrix: {
            batch: {
                lead: {
                    get: (_cmd: string, leadId: number) => {
                        pendingGets.push(leadId);
                    },
                    update: (
                        _cmd: string,
                        leadId: number,
                        fields: Record<string, unknown>,
                    ) => {
                        updates.push({ leadId, fields });
                    },
                },
            },
            api: {
                callBatchWithConcurrency: () => {
                    const result: Record<string, unknown> = {};
                    for (const leadId of pendingGets.splice(0)) {
                        result[`lr_sync_get_${leadId}`] = leadRows[leadId];
                    }
                    return Promise.resolve([{ result }]);
                },
            },
        },
    };
};

const makeCtx = (over: Record<string, unknown>) =>
    ({
        lead: null,
        ownerDeal: null,
        dto: {},
        ...over,
    }) as never;

describe('EventReportLeadRequestSyncService', () => {
    it('не финал → лиды не читаются и не пишутся', async () => {
        const { bitrix, updates } = makeBitrix({});
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        const result = await service.run(
            makeCtx({ isSuccessSale: false, isFail: false }),
        );
        expect(result.synced).toBe(0);
        expect(updates).toHaveLength(0);
    });

    it('продажа: статус/стадия «Продажа», boost_sale=1, история дописана', async () => {
        const { bitrix, updates } = makeBitrix({
            42: { ID: '42', UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY: ['старое'] },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        const result = await service.run(
            makeCtx({
                isSuccessSale: true,
                isFail: false,
                ownerDeal: { ID: '500', UF_CRM_DEAL_FROM_LEAD_ID: 'L_42' },
            }),
        );

        expect(result.synced).toBe(1);
        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_LEAD_STATUS).toBe(8);
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(99);
        expect(fields.UF_CRM_OP_LEAD_IS_BOOST_SALE).toBe(1);
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history[0]).toBe('старое'); // прошлое не переписано
        expect(history[1]).toContain('Продажа');
    });

    it('отказ с типом «не ЦА»: статусы «Не ЦА» + тип + заметка в историю', async () => {
        const { bitrix, updates } = makeBitrix({
            42: { ID: '42' },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            makeCtx({
                isSuccessSale: false,
                isFail: true,
                lead: { ID: '42' },
                dto: {
                    leadSync: {
                        notCaTypeCode: 'op_lead_not_ca_type4',
                        note: 'Бюджетники, не наш профиль',
                    },
                },
            }),
        );

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_LEAD_SITE_STATUS).toBe(33); // Не ЦА
        expect(fields.UF_CRM_OP_LEAD_STATUS).toBe(10);
        expect(fields.UF_CRM_OP_LEAD_NOT_CA_TYPE).toBe(44);
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history.join(' ')).toContain('не ЦА');
        expect(history.join(' ')).toContain('Бюджетники');
    });

    it('обычный отказ без типа: статус заявки «Отказ», тип не трогается', async () => {
        const { bitrix, updates } = makeBitrix({ 42: { ID: '42' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            makeCtx({
                isSuccessSale: false,
                isFail: true,
                lead: { ID: '42' },
            }),
        );
        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_LEAD_SITE_STATUS).toBe(55); // Отказ
        expect(fields.UF_CRM_OP_LEAD_STATUS).toBe(9);
        expect(fields.UF_CRM_OP_LEAD_NOT_CA_TYPE).toBeUndefined();
    });

    it('связь презентации без финала: пишется ТОЛЬКО выбранный лид — статусы менеджера, to_presentation_sales ∪, история', async () => {
        const { bitrix, updates } = makeBitrix({
            77: { ID: '77', UF_CRM_TO_PRESENTATION_SALES: ['D_5'] },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        const result = await service.run(
            makeCtx({
                isSuccessSale: false,
                isFail: false,
                // Контекст компании со своими лидами — они НЕ трогаются.
                ownerDeal: { ID: '500', UF_CRM_DEAL_FROM_LEAD_ID: 'L_42' },
                currentPresDeal: { ID: '900' },
                dto: {
                    leadSync: {
                        leadId: 77,
                        presentationLink: true,
                        siteStatusCode: 'op_lead_site_status4',
                        siteStageCode: 'op_lead_site_stage4',
                    },
                },
            }),
        );
        expect(result.synced).toBe(1);
        expect(updates).toHaveLength(1);
        expect(updates[0].leadId).toBe(77);
        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_LEAD_SITE_STATUS).toBe(34);
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(84);
        expect(fields.UF_CRM_TO_PRESENTATION_SALES).toEqual(['D_5', 'D_900']);
        const history = fields.UF_CRM_OP_LEAD_FIRSTPREPARE_HISTORY as string[];
        expect(history.join(' ')).toContain('Презентация связана с заявкой');
    });

    it('связь презентации: сделка презентации создаётся этим же отчётом (currentPresDeal нет) → линк не пишется, статусы пишутся', async () => {
        const { bitrix, updates } = makeBitrix({ 77: { ID: '77' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            makeCtx({
                isSuccessSale: false,
                isFail: false,
                currentPresDeal: null,
                dto: {
                    leadSync: {
                        leadId: 77,
                        presentationLink: true,
                        siteStageCode: 'op_lead_site_stage4',
                    },
                },
            }),
        );
        const fields = updates[0].fields;
        expect(fields.UF_CRM_TO_PRESENTATION_SALES).toBeUndefined();
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(84);
    });
});
