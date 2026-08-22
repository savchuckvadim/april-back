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
    to_sale_deal: { bitrixId: 'TO_SALE_DEAL' },
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
    // Анкета после презентации (перенос на связанный лид).
    op_presentation_xvost: { bitrixId: 'OP_PRESENTATION_XVOST' },
    op_presentation_5k: { bitrixId: 'OP_PRESENTATION_5K' },
    op_5k_client_what: { bitrixId: 'OP_5K_CLIENT_WHAT' },
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
        // Атрибуция продажи: заявка помечена сделкой, по которой прошла
        // продажа. Привязок поля не знаем (definitions пусты) → префикс.
        expect(fields.UF_CRM_TO_SALE_DEAL).toBe('D_500');
    });

    /*
     * Поле одиночное: перезапись стёрла бы фактическую атрибуцию продажи —
     * единственное место, где видно, какая заявка привела к деньгам.
     */
    it('связь продажи уже стоит → не перезаписывается', async () => {
        const { bitrix, updates } = makeBitrix({
            42: { ID: '42', UF_CRM_TO_SALE_DEAL: '777' },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );

        await service.run(
            makeCtx({
                isSuccessSale: true,
                isFail: false,
                ownerDeal: { ID: '500', UF_CRM_DEAL_FROM_LEAD_ID: 'L_42' },
            }),
        );

        expect(updates[0].fields.UF_CRM_TO_SALE_DEAL).toBeUndefined();
    });

    /*
     * У поля разрешён ОДИН тип сущности (обычная установка `to_sale_deal`)
     * — значение хранится голым id, а `D_500` Битрикс молча отбросит.
     */
    it('одна привязка в SETTINGS → пишем голый id, без префикса', async () => {
        const { bitrix, updates } = makeBitrix({ 42: { ID: '42' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
            { UF_CRM_TO_SALE_DEAL: { itemNames: {}, crmTypes: ['DEAL'] } },
        );

        await service.run(
            makeCtx({
                isSuccessSale: true,
                isFail: false,
                ownerDeal: { ID: '500', UF_CRM_DEAL_FROM_LEAD_ID: 'L_42' },
            }),
        );

        expect(updates[0].fields.UF_CRM_TO_SALE_DEAL).toBe('500');
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

    /* ------------------------------------------------------------------ *
     * Анкета проведённой презентации → связанный лид.
     * Источник — лид контекста (в него анкету пишет фрейм); цель — заявка,
     * выбранная менеджером в модалке. Себе самому не пишется.
     * ------------------------------------------------------------------ */

    const SURVEY_CTX_LEAD = {
        ID: '42',
        UF_CRM_OP_PRESENTATION_XVOST: 'Дожать по хвосту',
        UF_CRM_OP_PRESENTATION_5K: 'Сводка 5К',
        UF_CRM_OP_5K_CLIENT_WHAT: 'Хочет замену Консультанта',
    };

    const surveyCtx = (over: Record<string, unknown> = {}) =>
        makeCtx({
            isSuccessSale: false,
            isFail: false,
            isPresentationDone: true,
            lead: SURVEY_CTX_LEAD,
            currentPresDeal: null,
            dto: {
                leadSync: {
                    leadId: 77,
                    presentationLink: true,
                    siteStageCode: 'op_lead_site_stage4',
                },
            },
            ...over,
        });

    it('анкета переносится на связанный лид, пустые значения не затирают', async () => {
        const { bitrix, updates } = makeBitrix({
            77: { ID: '77', UF_CRM_OP_PRESENTATION_XVOST: 'старый хвост' },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            surveyCtx({
                lead: {
                    ...SURVEY_CTX_LEAD,
                    UF_CRM_OP_PRESENTATION_5K: '   ', // не заполнено
                },
            }),
        );

        const fields = updates[0].fields;
        // Скаляр перезаписан значением последней проведённой.
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBe('Дожать по хвосту');
        expect(fields.UF_CRM_OP_5K_CLIENT_WHAT).toBe(
            'Хочет замену Консультанта',
        );
        // Пустой ответ не затирает то, что уже стоит на заявке.
        expect(fields.UF_CRM_OP_PRESENTATION_5K).toBeUndefined();
    });

    /*
     * Запись на связанный лид уходит batch-командой (lead.update волны 2):
     * многострочные ответы обязаны быть экранированы в %0A.
     */
    it('многострочная анкета доезжает на связанный лид с %0A', async () => {
        const { bitrix, updates } = makeBitrix({ 77: { ID: '77' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            surveyCtx({
                lead: {
                    ...SURVEY_CTX_LEAD,
                    UF_CRM_OP_PRESENTATION_XVOST: 'строка 1\nстрока 2',
                },
            }),
        );

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBe('строка 1%0Aстрока 2');
        expect(String(fields.UF_CRM_OP_PRESENTATION_XVOST)).not.toMatch(
            /[\r\n]/,
        );
    });

    it('связанный лид и есть лид контекста → анкета не пишется (ответы уже там)', async () => {
        const { bitrix, updates } = makeBitrix({
            42: { ID: '42' },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            surveyCtx({
                dto: {
                    leadSync: {
                        leadId: 42, // тот же лид
                        presentationLink: true,
                        siteStageCode: 'op_lead_site_stage4',
                    },
                },
            }),
        );

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBeUndefined();
        expect(fields.UF_CRM_OP_5K_CLIENT_WHAT).toBeUndefined();
        // Статусы модалки при этом применяются как раньше.
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(84);
    });

    it('лида-источника в контексте нет → анкета молча пропускается', async () => {
        const { bitrix, updates } = makeBitrix({ 77: { ID: '77' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(surveyCtx({ lead: null }));

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBeUndefined();
        expect(fields.UF_CRM_OP_LEAD_SITE_STAGE).toBe(84);
    });

    it('презентация не проведена → анкета связанному лиду не переносится', async () => {
        const { bitrix, updates } = makeBitrix({ 77: { ID: '77' } });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(surveyCtx({ isPresentationDone: false }));

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBeUndefined();
    });

    it('финал без связи презентации: другие лиды анкету не получают', async () => {
        const { bitrix, updates } = makeBitrix({
            42: { ID: '42' },
        });
        const service = new EventReportLeadRequestSyncService(
            bitrix as never,
            makePortal() as never,
        );
        await service.run(
            makeCtx({
                isSuccessSale: true,
                isFail: false,
                isPresentationDone: true,
                lead: SURVEY_CTX_LEAD,
                ownerDeal: null,
                dto: {},
            }),
        );

        const fields = updates[0].fields;
        expect(fields.UF_CRM_OP_PRESENTATION_XVOST).toBeUndefined();
        expect(fields.UF_CRM_OP_LEAD_STATUS).toBe(8); // финал отработал
    });
});
