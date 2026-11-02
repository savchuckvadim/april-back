import {
    collectSlaTransfers,
    ISlaTransferTimelineInput,
    LeadToWorkSlaTimelineService,
} from '../services/lead-to-work-sla-timeline.service';

/**
 * Комментарий о передаче по SLA: люди читают ленту карточки, а не UF-поле
 * истории заявки (garant 02.11.2026, сделка 110469 — «кто передал?»).
 */
const makeBitrix = () => {
    const comments: { cmd: string; data: Record<string, unknown> }[] = [];
    const flush = jest.fn().mockResolvedValue([]);
    return {
        comments,
        flush,
        bitrix: {
            batch: {
                timeline: {
                    addTimelineComment: (
                        cmd: string,
                        data: Record<string, unknown>,
                    ) => {
                        comments.push({ cmd, data });
                    },
                },
            },
            api: { callBatchWithConcurrency: flush },
        },
    };
};

const TRANSFER: ISlaTransferTimelineInput = {
    leadId: 355895,
    leadTitle: 'Климентов Сергей (3372096)',
    dealId: 110469,
    minutes: 60,
    previousResponsibleId: 69,
    responsibleId: 323,
};

const NAMES = { 69: 'Яна Сова', 323: 'Яна Бунеева' };

const decode = (comment: unknown): string =>
    decodeURIComponent(String(comment).replace(/\+/g, ' '));

describe('LeadToWorkSlaTimelineService', () => {
    it('пишет в лид и в сделку: кто не подтвердил, кому ушло, что делать', async () => {
        const { bitrix, comments, flush } = makeBitrix();
        const service = new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
            NAMES,
        );

        const warnings = await service.write([TRANSFER]);

        expect(warnings).toEqual([]);
        expect(flush).toHaveBeenCalledTimes(1);
        expect(comments.map(c => c.cmd)).toEqual([
            'lw_sla_tl_lead_355895',
            'lw_sla_tl_deal_110469',
        ]);

        const [lead, deal] = comments;
        expect(lead.data.ENTITY_TYPE).toBe('lead');
        expect(lead.data.ENTITY_ID).toBe(355895);
        expect(deal.data.ENTITY_TYPE).toBe('deal');
        expect(deal.data.ENTITY_ID).toBe(110469);

        const text = decode(lead.data.COMMENT);
        expect(text).toContain('не подтверждена за 60 рабочих минут: Яна Сова');
        expect(text).toContain('Новый ответственный: Яна Бунеева');
        expect(text).toContain('Что сделать');
        // Имена, не id.
        expect(text).not.toMatch(/\b69\b|\b323\b/);
    });

    it('перекрёстные ссылки — html: из лида в сделку, из сделки в заявку', async () => {
        const { bitrix, comments } = makeBitrix();
        await new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
            NAMES,
        ).write([TRANSFER]);

        const lead = decode(comments[0].data.COMMENT);
        const deal = decode(comments[1].data.COMMENT);
        expect(lead).toContain(
            '<a href="https://d.b24.ru/crm/deal/details/110469/" target="_blank">№110469</a>',
        );
        expect(lead).not.toContain('/crm/lead/details/');
        expect(deal).toContain(
            '<a href="https://d.b24.ru/crm/lead/details/355895/" target="_blank">',
        );
        expect(deal).toContain('Климентов Сергей (3372096) (лид #355895)');
        expect(deal).not.toContain('/crm/deal/details/');
    });

    it('без сделки — только лид, без ссылки на сделку', async () => {
        const { bitrix, comments } = makeBitrix();
        await new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
        ).write([{ ...TRANSFER, dealId: null }]);

        expect(comments).toHaveLength(1);
        expect(comments[0].cmd).toBe('lw_sla_tl_lead_355895');
        expect(decode(comments[0].data.COMMENT)).not.toContain('Сделка:');
    });

    it('имени нет → id, операция не падает', async () => {
        const { bitrix, comments } = makeBitrix();
        await new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
        ).write([TRANSFER]);
        expect(decode(comments[0].data.COMMENT)).toContain(
            'рабочих минут: 69.',
        );
    });

    it('пусто → батч не вызывается', async () => {
        const { bitrix, flush } = makeBitrix();
        const warnings = await new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
        ).write([]);
        expect(warnings).toEqual([]);
        expect(flush).not.toHaveBeenCalled();
    });

    it('ошибка батча → предупреждение, не бросает', async () => {
        const { bitrix, flush } = makeBitrix();
        flush.mockRejectedValue(new Error('QUERY_LIMIT_EXCEEDED'));

        const warnings = await new LeadToWorkSlaTimelineService(
            bitrix as never,
            'd.b24.ru',
        ).write([TRANSFER]);

        expect(warnings.join(' ')).toContain('QUERY_LIMIT_EXCEEDED');
    });
});

describe('collectSlaTransfers', () => {
    const base = {
        item: { leadId: 42, sla: { minutes: 60 } },
        leadTitle: 'ООО Ромашка',
        responsible: 8,
        previousResponsibleId: 5,
        dealId: 1024,
    };

    it('передача по SLA со сменой ответственного → в таймлайн', () => {
        expect(collectSlaTransfers([base])).toEqual([
            {
                leadId: 42,
                leadTitle: 'ООО Ромашка',
                dealId: 1024,
                minutes: 60,
                previousResponsibleId: 5,
                responsibleId: 8,
            },
        ]);
    });

    it('обычное назначение, кнопка «Передать другому», ошибка — мимо', () => {
        expect(
            collectSlaTransfers([
                { ...base, item: { leadId: 42 } },
                { ...base, item: { leadId: 43, transferredBy: 5 } },
                { ...base, error: 'Лид не прочитан' },
                { ...base, responsible: undefined },
            ]),
        ).toEqual([]);
    });

    /*
     * Единственный кандидат в отделе получает заявку обратно: это не
     * передача, писать «передана» было бы ложью (руководителю уже сообщил
     * сам SLA).
     */
    it('ответственный не сменился → комментария нет', () => {
        expect(
            collectSlaTransfers([
                { ...base, responsible: 5 },
                { ...base, previousResponsibleId: null },
            ]),
        ).toEqual([]);
    });

    it('без названия лида — подпись по номеру', () => {
        expect(
            collectSlaTransfers([{ ...base, leadTitle: undefined }])[0]
                .leadTitle,
        ).toBe('Лид 42');
    });
});
