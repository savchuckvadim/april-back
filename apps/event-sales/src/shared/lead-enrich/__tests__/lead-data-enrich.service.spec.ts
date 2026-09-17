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
    const fields = (add?.params.fields ?? {}) as Row;
    return String(fields.COMMENT ?? '');
};

describe('LeadDataEnrichService', () => {
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
        expect(fields.UF_CRM_OP_INN_POOL).toEqual([
            '7707083893',
            '7812032055',
        ]);
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
        expect(
            calls.some(c => c.method === 'crm.timeline.comment.add'),
        ).toBe(false);
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
