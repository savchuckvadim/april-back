import { InnManualSetService } from '../inn-manual-set.service';
import {
    InnDealClosedError,
    InnInvalidValueError,
    InnNoTargetError,
} from '../../lib/inn.errors';

const INN = '7707083893';
const OLD = '7812032055';
const UF_INN = 'UF_CRM_OP_INN';
const UF_POOL = 'UF_CRM_OP_INN_POOL';

type Row = Record<string, unknown>;

/** Одинаковые поля ИНН у сделки, компании и заявки — как на порталах. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : code === 'deal_from_lead_id'
                ? { bitrixId: 'FROM_LEAD' }
                : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

const setup = (rows: { deal?: Row | null; company?: Row; lead?: Row }) => {
    const calls: { method: string; params: Row }[] = [];
    const result: Record<string, unknown> = {
        'crm.deal.get': rows.deal ?? null,
        'crm.company.get': rows.company ?? { ID: '55', TITLE: 'ООО' },
        'crm.lead.get': rows.lead ?? null,
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: result[method] ?? [] });
            },
        },
        requisite: { getList: () => Promise.resolve({ result: [] }) },
        requisiteLink: { getList: () => Promise.resolve({ result: [] }) },
        requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
    };
    return {
        calls,
        updates: (method: string) =>
            calls
                .filter(call => call.method === method)
                .map(call => call.params.fields as Row),
        service: new InnManualSetService(
            bitrix as never,
            portal,
            'portal.bitrix24.ru',
        ),
    };
};

const actor = { id: 447, name: 'Иванов Иван' };

/**
 * ИНН из шапки «Звонков» (26.10.2026): раньше писался прямо из браузера,
 * теперь — через единственного писателя по правилам «Выбрать».
 */
describe('InnManualSetService', () => {
    it('открытая сделка: сделка, пул, компания поверх, пустая заявка и лента', async () => {
        const fx = setup({
            deal: {
                ID: '100',
                COMPANY_ID: '55',
                UF_CRM_FROM_LEAD: '7',
                [UF_INN]: OLD,
                [UF_POOL]: [OLD],
            },
            company: { ID: '55', [UF_INN]: OLD, [UF_POOL]: [OLD] },
            lead: { ID: '7' },
        });

        const result = await fx.service.set(
            { dealId: 100, companyId: 55 },
            ` ${INN} `,
            actor,
        );

        expect(result).toEqual({ inn: INN, entity: 'deal', warnings: [] });
        expect(fx.updates('crm.deal.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [OLD, INN] },
        ]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [UF_POOL]: [OLD, INN], [UF_INN]: INN },
        ]);
        expect(fx.updates('crm.lead.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [INN] },
        ]);
        expect(
            fx.calls.some(call => call.method === 'crm.timeline.comment.add'),
        ).toBe(true);
    });

    it('закрытая сделка не меняется — ИНН ложится в компанию', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', CLOSED: 'Y', [UF_INN]: OLD },
            company: { ID: '55', [UF_INN]: OLD, [UF_POOL]: [OLD] },
        });

        const result = await fx.service.set(
            { dealId: 100, companyId: 55 },
            INN,
            actor,
        );

        expect(result.entity).toBe('company');
        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [OLD, INN] },
        ]);
    });

    it('без сделки и компании — заявка: текущий поверх прежнего', async () => {
        const fx = setup({ lead: { ID: '7', [UF_INN]: OLD } });

        const result = await fx.service.set({ leadId: 7 }, INN, actor);

        expect(result.entity).toBe('lead');
        expect(fx.updates('crm.lead.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [INN] },
        ]);
    });

    it('тот же ИНН уже стоит в компании — повторной записи нет', async () => {
        const fx = setup({
            company: { ID: '55', [UF_INN]: INN, [UF_POOL]: [INN] },
        });

        const result = await fx.service.set({ companyId: 55 }, INN, actor);

        expect(result.entity).toBe('company');
        expect(fx.updates('crm.company.update')).toEqual([]);
    });

    it('не ИНН — ошибка до любых запросов', async () => {
        const fx = setup({});
        await expect(
            fx.service.set({ companyId: 55 }, '1234567890', actor),
        ).rejects.toBeInstanceOf(InnInvalidValueError);
        expect(fx.calls).toEqual([]);
    });

    it('закрытая сделка без компании и заявки — 409 «только чтение»', async () => {
        const fx = setup({ deal: { ID: '100', CLOSED: 'Y' } });
        await expect(
            fx.service.set({ dealId: 100 }, INN, actor),
        ).rejects.toBeInstanceOf(InnDealClosedError);
    });

    it('писать некуда — понятная ошибка', async () => {
        const fx = setup({ deal: null });
        await expect(
            fx.service.set({ dealId: 100 }, INN, actor),
        ).rejects.toBeInstanceOf(InnNoTargetError);
    });
});
