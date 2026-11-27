import { BadRequestException } from '@nestjs/common';
import type { PBXService } from '@lib/pbx';
import { resolveInnActor } from '../inn-actor.resolver';
import { setInnManually } from '../inn-manual-set.entry';

const DOMAIN = 'portal.bitrix24.ru';
const INN = '7707083893';

type Row = Record<string, unknown>;

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

const makeBitrix = (user: () => Promise<unknown>) => {
    const calls: { method: string; params: Row }[] = [];
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({
                    result:
                        method === 'crm.company.get'
                            ? { ID: '55', TITLE: 'ООО' }
                            : [],
                });
            },
        },
        user: { get: user },
        requisite: { getList: () => Promise.resolve({ result: [] }) },
        requisiteLink: { getList: () => Promise.resolve({ result: [] }) },
        requisitePreset: { getList: () => Promise.resolve({ result: [] }) },
    };
    return { bitrix, calls };
};

const namedUser = () =>
    Promise.resolve({
        result: [{ ID: '12', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    });

describe('resolveInnActor', () => {
    it('имя берётся у портала: фамилия и имя', async () => {
        const { bitrix } = makeBitrix(namedUser);

        await expect(resolveInnActor(bitrix as never, 12)).resolves.toEqual({
            id: 12,
            name: 'Иванов Иван',
        });
    });

    it('без userId портал не спрашивают', async () => {
        const user = jest.fn();
        const { bitrix } = makeBitrix(user);

        await expect(
            resolveInnActor(bitrix as never, undefined),
        ).resolves.toEqual({ id: null, name: '' });
        expect(user).not.toHaveBeenCalled();
    });

    it('портал не ответил: запись состоится с пустым именем', async () => {
        const { bitrix } = makeBitrix(() => Promise.reject(new Error('503')));

        await expect(resolveInnActor(bitrix as never, 12)).resolves.toEqual({
            id: 12,
            name: '',
        });
    });
});

describe('setInnManually', () => {
    const makePbx = (user = namedUser) => {
        const { bitrix, calls } = makeBitrix(user);
        const domains: string[] = [];
        const pbx = {
            init: (domain: string): Promise<unknown> => {
                domains.push(domain);
                return Promise.resolve({ bitrix, PortalModel: portal });
            },
        } as unknown as Pick<PBXService, 'init'>;
        return { pbx, calls, domains };
    };

    it('инстанс по домену запроса, запись в компанию, ответ сервиса', async () => {
        const { pbx, calls, domains } = makePbx();

        const result = await setInnManually(pbx, {
            domain: DOMAIN,
            inn: INN,
            companyId: 55,
            userId: 12,
        });

        expect(domains).toEqual([DOMAIN]);
        expect(result).toEqual({ inn: INN, entity: 'company', warnings: [] });
        const update = calls.find(call => call.method === 'crm.company.update');
        expect(update?.params.fields).toEqual({
            UF_CRM_OP_INN: INN,
            UF_CRM_OP_INN_POOL: [INN],
        });
    });

    it('не ИНН: доменная ошибка превращается в 400', async () => {
        const { pbx } = makePbx();

        await expect(
            setInnManually(pbx, {
                domain: DOMAIN,
                inn: '1234567890',
                companyId: 55,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
