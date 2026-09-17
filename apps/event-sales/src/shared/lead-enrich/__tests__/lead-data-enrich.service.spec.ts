import { LeadDataEnrichService } from '../lead-data-enrich.service';

type Row = Record<string, unknown>;

/**
 * Портал-заглушка: поля ИНН установлены на всех трёх сущностях, как на бою.
 */
const portal = {
    getEntityFieldByCode: (entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

/** Лид «как с сайта»: телефон, почта, регион и номер заявки заполнены. */
const LEAD: Row = {
    ID: '777',
    TITLE: 'ООО «Ромашка»',
    PHONE: [{ VALUE: '+79102880648' }],
    EMAIL: [{ VALUE: 'client@example.com' }],
    UF_CRM_USER_REGION: 'Воронежская область',
    UF_CRM_DEPARTMENT_STRING: 'ОП Воронеж',
    UF_CRM_ORDER_NUMBER: '2184035',
    UF_CRM_REG_NUMBER: '36-07331',
};

interface ICallLog {
    method: string;
    params: Row;
}

/** Битрикс-заглушка: пишет вызовы и отвечает подготовленными строками. */
function makeBitrix(rows: Record<string, Row | Row[]>): {
    bitrix: { api: { call: (m: string, p: Row) => Promise<unknown> } };
    calls: ICallLog[];
} {
    const calls: ICallLog[] = [];
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: rows[method] ?? [] });
            },
        },
    };
    return { bitrix, calls };
}

const commentOf = (calls: ICallLog[]): string => {
    const add = calls.find(c => c.method === 'crm.timeline.comment.add');
    const fields = (add?.params.fields ?? {}) as Record<string, string>;
    return fields.COMMENT ?? '';
};

/** Портал, где парные поля заявки на сделке УЖЕ установлены. */
const INSTALLED: Record<string, string> = {
    op_inn: 'OP_INN',
    op_inn_pool: 'OP_INN_POOL',
    lead_user_region: 'LEAD_USER_REGION',
    lead_order_number: 'LEAD_ORDER_NUMBER',
    lead_reg_number: 'LEAD_REG_NUMBER',
    department_string: 'DEPARTMENT_STRING',
    op_lead_phones: 'OP_LEAD_PHONES',
    op_lead_emails: 'OP_LEAD_EMAILS',
};
const portalWithFields = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        INSTALLED[code] ? { bitrixId: INSTALLED[code] } : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

describe('LeadDataEnrichService', () => {
    /*
     * Решение владельца 17.09.2026: данные заявки нужны в ПОЛЯХ сделки, а не
     * только в карточке таймлайна.
     */
    it('данные заявки копируются в поля сделки', async () => {
        const { bitrix, calls } = makeBitrix({ 'crm.lead.get': LEAD });
        const service = new LeadDataEnrichService(
            bitrix,
            portalWithFields,
            'portal.bitrix24.ru',
        );

        await service.enrich(100, { ID: '100' }, [777]);

        const update = calls.find(
            c =>
                c.method === 'crm.deal.update' &&
                'UF_CRM_LEAD_USER_REGION' in ((c.params.fields ?? {}) as Row),
        );
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_LEAD_USER_REGION).toBe('Воронежская область');
        expect(fields.UF_CRM_LEAD_ORDER_NUMBER).toBe('2184035');
        expect(fields.UF_CRM_LEAD_REG_NUMBER).toBe('36-07331');
        expect(fields.UF_CRM_DEPARTMENT_STRING).toBe('ОП Воронеж');
        // Поля установлены ОДИНОЧНОЙ строкой — значения через запятую.
        expect(fields.UF_CRM_OP_LEAD_PHONES).toBe('+79102880648');
        expect(fields.UF_CRM_OP_LEAD_EMAILS).toBe('client@example.com');
    });

    it('заполненное руками не перетирается, телефоны объединяются', async () => {
        const { bitrix, calls } = makeBitrix({ 'crm.lead.get': LEAD });
        const service = new LeadDataEnrichService(
            bitrix,
            portalWithFields,
            'portal.bitrix24.ru',
        );

        await service.enrich(
            100,
            {
                ID: '100',
                UF_CRM_LEAD_USER_REGION: 'Москва',
                UF_CRM_OP_LEAD_PHONES: '+70000000000',
            },
            [777],
        );

        const update = calls.find(
            c =>
                c.method === 'crm.deal.update' &&
                'UF_CRM_OP_LEAD_PHONES' in ((c.params.fields ?? {}) as Row),
        );
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_LEAD_USER_REGION).toBeUndefined();
        expect(fields.UF_CRM_OP_LEAD_PHONES).toBe('+70000000000, +79102880648');
    });

    it('поля не установлены — в поля ничего не пишется', async () => {
        const { bitrix, calls } = makeBitrix({ 'crm.lead.get': LEAD });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        await service.enrich(100, { ID: '100' }, [777]);

        const leadDataWrite = calls.some(
            c =>
                c.method === 'crm.deal.update' &&
                Object.keys((c.params.fields ?? {}) as Row).some(key =>
                    key.startsWith('UF_CRM_LEAD_USER_'),
                ),
        );
        expect(leadDataWrite).toBe(false);
    });

    /*
     * Главное требование владельца: телефоны и почты обязаны доезжать до
     * сделки хотя бы записью в таймлайн. Своих полей телефона и почты у
     * сделки в Битриксе нет, поэтому другого пути у них не существует.
     */
    it('телефоны, почты и поля заявки уходят в таймлайн сделки', async () => {
        const { bitrix, calls } = makeBitrix({ 'crm.lead.get': LEAD });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(100, { ID: '100' }, [777]);

        expect(result.timelinePosted).toBe(true);
        const comment = commentOf(calls);
        expect(comment).toContain('+79102880648');
        expect(comment).toContain('client@example.com');
        expect(comment).toContain('Воронежская область');
        expect(comment).toContain('2184035');
        expect(comment).toContain('36-07331');
        // Ссылка на лид — кликабельная, а не голый текст.
        expect(comment).toContain(
            '<a href="https://portal.bitrix24.ru/crm/lead/details/777/"',
        );
    });

    /*
     * 16.09.2026 в карточку уехало «Телефоны: %2B79102880648»: комментарий
     * собирался батч-сборщиком, а отправлялся прямым вызовом, и
     * экранирование декодировать было некому.
     */
    it('в комментарии нет batch-экранирования', async () => {
        const { bitrix, calls } = makeBitrix({ 'crm.lead.get': LEAD });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        await service.enrich(100, { ID: '100' }, [777]);

        const comment = commentOf(calls);
        expect(comment).not.toContain('%0A');
        expect(comment).not.toContain('%2B');
        expect(comment).not.toContain('%23');
        expect(comment).toContain('\n');
    });

    it('ИНН из реквизитов компании уходит в поля сделки', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': LEAD,
            'crm.company.get': { ID: '55', TITLE: 'ООО «Ромашка»' },
            'crm.requisite.list': [{ ID: '1', RQ_INN: '7812032055' }],
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(
            100,
            { ID: '100', COMPANY_ID: '55' },
            [777],
        );

        expect(result.inns).toEqual(['7812032055']);
        const update = calls.find(c => c.method === 'crm.deal.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN).toBe('7812032055');
        expect(fields.UF_CRM_OP_INN_POOL).toEqual(['7812032055']);
    });

    /*
     * Выбор человека в `op_inn` не перетирается: поле пополняется только
     * когда пусто, иначе догон затирал бы ручную правку менеджера.
     */
    it('заполненный op_inn не перезаписывается, пул пополняется', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': LEAD,
            'crm.company.get': { ID: '55' },
            'crm.requisite.list': [{ ID: '1', RQ_INN: '7812032055' }],
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        await service.enrich(
            100,
            {
                ID: '100',
                COMPANY_ID: '55',
                UF_CRM_OP_INN: '7707083893',
                UF_CRM_OP_INN_POOL: ['7707083893'],
            },
            [777],
        );

        const update = calls.find(c => c.method === 'crm.deal.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN).toBeUndefined();
        expect(fields.UF_CRM_OP_INN_POOL).toEqual(['7707083893', '7812032055']);
    });

    /*
     * Повторный вызов хука не должен плодить карточки — тот же урок, что с
     * задачами «Звонок по переданной работе».
     */
    it('карточка не пишется второй раз', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': LEAD,
            'crm.timeline.comment.list': [
                { ID: '1', COMMENT: '<b>Данные заявки</b>\nТелефоны: ...' },
            ],
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(100, { ID: '100' }, [777]);

        expect(result.timelinePosted).toBe(false);
        expect(calls.some(c => c.method === 'crm.timeline.comment.add')).toBe(
            false,
        );
        // Но закрепляем: закрепление появилось позже самой карточки,
        // и записи от 16.09 остались висеть в ленте.
        const pin = calls.find(c => c.method === 'crm.timeline.item.pin');
        expect(pin?.params).toMatchObject({ id: 1, ownerId: 100 });
    });

    /*
     * Карточку закрепляем наверху таймлайна — ради этого всё и делалось:
     * менеджер должен видеть телефон сразу, а не листать ленту.
     */
    it('карточка закрепляется в сделке', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': LEAD,
            'crm.timeline.comment.add': 8412 as never,
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        await service.enrich(100, { ID: '100' }, [777]);

        const pin = calls.find(c => c.method === 'crm.timeline.item.pin');
        expect(pin?.params).toMatchObject({
            id: 8412,
            ownerTypeId: 2,
            ownerId: 100,
        });
    });

    /*
     * ПРАВИЛА ЗАПИСИ ИНН ПЕРЕЕХАЛИ В `@lib/portal-lib/pbx-inn`
     * (постановка ai/tasks/2026-09-17-inn-strategy.md, 17.09.2026).
     *
     * Что изменилось для хука: `op_inn` больше не заполняется «первым
     * валидным из найденных». Автоматика ставит его сама, только когда
     * кандидат ровно ОДИН и он не «слабый». Пул по-прежнему пополняется
     * объединением, и теперь вместе с ним синхронизируется пул компании —
     * раньше это умел только ночной скрипт догона.
     */
    it('кандидатов несколько — op_inn оставляем человеку', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': { ...LEAD, UF_CRM_OP_INN: '500100732259' },
            'crm.company.get': { ID: '55', TITLE: 'ООО «Ромашка»' },
            'crm.requisite.list': [{ ID: '1', RQ_INN: '7812032055' }],
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(
            100,
            { ID: '100', COMPANY_ID: '55' },
            [777],
        );

        expect(result.inns.sort()).toEqual(['500100732259', '7812032055']);
        const update = calls.find(c => c.method === 'crm.deal.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN).toBeUndefined();
        expect(fields.UF_CRM_OP_INN_POOL).toEqual([
            '7812032055',
            '500100732259',
        ]);
    });

    it('единственный ИНН из названия — слишком слабо для автоподстановки', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': {
                ID: '777',
                TITLE: 'ООО «Ромашка» ИНН 7707083893',
            },
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(100, { ID: '100' }, [777]);

        expect(result.inns).toEqual(['7707083893']);
        const update = calls.find(c => c.method === 'crm.deal.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN).toBeUndefined();
        expect(fields.UF_CRM_OP_INN_POOL).toEqual(['7707083893']);
    });

    it('пул компании синхронизируется прямо из хука', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.lead.get': LEAD,
            'crm.company.get': { ID: '55', TITLE: 'ООО «Ромашка»' },
            'crm.requisite.list': [{ ID: '1', RQ_INN: '7812032055' }],
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        await service.enrich(100, { ID: '100', COMPANY_ID: '55' }, [777]);

        const update = calls.find(c => c.method === 'crm.company.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN_POOL).toEqual(['7812032055']);
    });

    /*
     * Номер заявки в скобках — не ИНН, хотя контрольную сумму
     * десятизначное число проходит примерно в одном случае из одиннадцати.
     */
    it('число в скобках из названия за ИНН не принимается', async () => {
        const { bitrix } = makeBitrix({
            'crm.lead.get': { ID: '777', TITLE: 'Заявка с сайта (7707083893)' },
        });
        const service = new LeadDataEnrichService(
            bitrix,
            portal,
            'portal.bitrix24.ru',
        );

        const result = await service.enrich(100, { ID: '100' }, [777]);

        expect(result.inns).toEqual([]);
    });
});
