import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PBXService } from '@lib/pbx';
import { KonstructorInnSetUseCase } from '../use-cases/inn-set.use-case';

const DOMAIN = 'april-garant.bitrix24.ru';
const INN = '7707083893';
const OLD = '7812032055';
const UF_INN = 'UF_CRM_OP_INN';
const UF_POOL = 'UF_CRM_OP_INN_POOL';

type Row = Record<string, unknown>;

interface Call {
    method: string;
    params: Row;
}

/** Модель портала: поля ИНН одинаковы у сделки, компании и заявки. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
};

/** PBXService-заглушка: инстанс Битрикса по домену и записи обновлений. */
const setup = (rows: { deal?: Row | null; company?: Row; lead?: Row }) => {
    const calls: Call[] = [];
    const domains: string[] = [];
    const users: unknown[] = [];
    const result: Record<string, unknown> = {
        'crm.deal.get': rows.deal ?? null,
        'crm.company.get': rows.company ?? { ID: '55', TITLE: 'ООО «Ромашка»' },
        'crm.lead.get': rows.lead ?? null,
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: result[method] ?? [] });
            },
        },
        user: {
            get: (filter: unknown): Promise<unknown> => {
                users.push(filter);
                return Promise.resolve({
                    result: [{ ID: '447', NAME: 'Иван', LAST_NAME: 'Иванов' }],
                });
            },
        },
        requisite: { getList: () => Promise.resolve({ result: [] }) },
        requisiteLink: { getList: () => Promise.resolve({ result: [] }) },
        requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
    };
    const pbx = {
        init: (domain: string): Promise<unknown> => {
            domains.push(domain);
            return Promise.resolve({ bitrix, PortalModel: portal });
        },
    } as unknown as PBXService;
    return {
        useCase: new KonstructorInnSetUseCase(pbx),
        domains,
        users,
        calls,
        updates: (method: string) =>
            calls
                .filter(call => call.method === method)
                .map(call => call.params.fields as Row),
    };
};

describe('KonstructorInnSetUseCase', () => {
    it('открытая сделка: ИНН в сделку и пул без дублей, компания поверх, запись в ленте', async () => {
        const fx = setup({
            deal: {
                ID: '100',
                COMPANY_ID: '55',
                [UF_INN]: OLD,
                [UF_POOL]: [OLD],
            },
            company: { ID: '55', [UF_INN]: OLD, [UF_POOL]: [OLD] },
        });

        const response = await fx.useCase.execute({
            domain: DOMAIN,
            inn: ` ${INN} `,
            dealId: 100,
            companyId: 55,
            userId: 447,
        });

        expect(response).toEqual({ inn: INN, entity: 'deal', warnings: [] });
        expect(fx.domains).toEqual([DOMAIN]);
        expect(fx.updates('crm.deal.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [OLD, INN] },
        ]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [UF_POOL]: [OLD, INN], [UF_INN]: INN },
        ]);
        const comment = fx.calls.find(
            call => call.method === 'crm.timeline.comment.add',
        );
        expect(String((comment?.params.fields as Row).COMMENT)).toContain(
            'Иванов Иван (#447)',
        );
    });

    it('тот же ИНН второй раз: пул не получает дубль', async () => {
        const fx = setup({
            deal: {
                ID: '100',
                COMPANY_ID: '55',
                [UF_INN]: INN,
                [UF_POOL]: [OLD, INN],
            },
            company: { ID: '55', [UF_INN]: INN, [UF_POOL]: [OLD, INN] },
        });

        const response = await fx.useCase.execute({
            domain: DOMAIN,
            inn: INN,
            dealId: 100,
            companyId: 55,
        });

        expect(response.entity).toBe('deal');
        const pools = [
            ...fx.updates('crm.deal.update'),
            ...fx.updates('crm.company.update'),
        ]
            .map(fields => fields[UF_POOL])
            .filter((pool): pool is string[] => Array.isArray(pool));
        for (const pool of pools) {
            expect(pool.filter(value => value === INN)).toHaveLength(1);
        }
    });

    it('без userId имя автора у портала не запрашивается', async () => {
        const fx = setup({
            deal: { ID: '100', COMPANY_ID: '55', [UF_POOL]: [] },
        });

        await fx.useCase.execute({ domain: DOMAIN, inn: INN, dealId: 100 });

        expect(fx.users).toEqual([]);
    });

    it('сделки нет — ИНН ложится в компанию', async () => {
        const fx = setup({
            company: { ID: '55', [UF_INN]: OLD, [UF_POOL]: [OLD] },
        });

        const response = await fx.useCase.execute({
            domain: DOMAIN,
            inn: INN,
            companyId: 55,
        });

        expect(response).toEqual({ inn: INN, entity: 'company', warnings: [] });
        expect(fx.updates('crm.deal.update')).toEqual([]);
        expect(fx.updates('crm.company.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [OLD, INN] },
        ]);
    });

    it('только заявка — ИНН ложится в заявку', async () => {
        const fx = setup({ lead: { ID: '7' } });

        const response = await fx.useCase.execute({
            domain: DOMAIN,
            inn: INN,
            leadId: 7,
        });

        expect(response.entity).toBe('lead');
        expect(fx.updates('crm.lead.update')).toEqual([
            { [UF_INN]: INN, [UF_POOL]: [INN] },
        ]);
    });

    it('не ИНН — 400 до любой записи', async () => {
        const fx = setup({});

        await expect(
            fx.useCase.execute({
                domain: DOMAIN,
                inn: '1234567890',
                companyId: 55,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fx.calls).toEqual([]);
    });

    it('закрытая сделка без компании и заявки — 409', async () => {
        const fx = setup({ deal: { ID: '100', CLOSED: 'Y' } });

        await expect(
            fx.useCase.execute({ domain: DOMAIN, inn: INN, dealId: 100 }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('писать некуда — 400', async () => {
        const fx = setup({ deal: null });

        await expect(
            fx.useCase.execute({ domain: DOMAIN, inn: INN, dealId: 100 }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
