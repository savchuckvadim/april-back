import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { InnUseCase } from '../use-cases/inn.use-case';

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

interface ICall {
    method: string;
    params: Row;
}

/** PBXService-заглушка: отдаёт инстанс Битрикса по домену, как на бою. */
function makePbx(deal: Row | null): {
    pbx: never;
    calls: ICall[];
    domains: string[];
} {
    const calls: ICall[] = [];
    const domains: string[] = [];
    const rows: Record<string, unknown> = {
        'crm.deal.get': deal,
        'crm.company.get': { ID: '55', TITLE: 'ООО «Ромашка»' },
        'crm.deal.contact.items.get': [],
        'crm.timeline.comment.list': [],
        'user.get': [{ ID: '12', NAME: 'Иван', LAST_NAME: 'Иванов' }],
    };
    const bitrix = {
        api: {
            call: (method: string, params: Row): Promise<unknown> => {
                calls.push({ method, params });
                return Promise.resolve({ result: rows[method] ?? [] });
            },
        },
        user: {
            get: (): Promise<unknown> =>
                Promise.resolve({ result: rows['user.get'] }),
        },
        requisite: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
        requisiteLink: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
        requisitePreset: {
            getList: (): Promise<unknown> => Promise.resolve({ result: [] }),
        },
    };
    const pbx = {
        init: (domain: string): Promise<unknown> => {
            domains.push(domain);
            return Promise.resolve({ bitrix, PortalModel: portal });
        },
    };
    return { pbx: pbx as never, calls, domains };
}

describe('InnUseCase', () => {
    const DOMAIN = 'portal.bitrix24.ru';

    it('снимок берёт инстанс Битрикса по домену запроса', async () => {
        const { pbx, domains } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx);

        const snapshot = await useCase.snapshot(100, DOMAIN);

        expect(domains).toEqual([DOMAIN]);
        expect(snapshot.dealId).toBe(100);
    });

    it('сделки нет — 404 вместо пустого ответа', async () => {
        const { pbx } = makePbx(null);
        const useCase = new InnUseCase(pbx);

        await expect(useCase.snapshot(100, DOMAIN)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('устаревшая версия снимка — 409', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: INN,
                version: 'stale',
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('закрытая сделка — 409 на попытку выбрать', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55', CLOSED: 'Y' });
        const useCase = new InnUseCase(pbx);
        const snapshot = await useCase.snapshot(100, DOMAIN);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: INN,
                version: snapshot.version,
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('невалидный ИНН — 400', async () => {
        const { pbx } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx);

        await expect(
            useCase.choose(100, {
                domain: DOMAIN,
                inn: '12345',
                version: 'any',
                userId: 12,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    /*
     * Подпись «кто выбрал» берём у портала, а не у фронта: запись аудита
     * должна быть достоверной.
     */
    it('имя автора подставляется из портала', async () => {
        const { pbx, calls } = makePbx({ ID: '100', COMPANY_ID: '55' });
        const useCase = new InnUseCase(pbx);
        const snapshot = await useCase.snapshot(100, DOMAIN);

        const after = await useCase.choose(100, {
            domain: DOMAIN,
            inn: INN,
            version: snapshot.version,
            userId: 12,
        });

        expect(after.current?.userName).toBe('Иванов Иван');
        const comment = calls.find(
            call => call.method === 'crm.timeline.comment.add',
        );
        expect(String((comment?.params.fields as Row).COMMENT)).toContain(
            'Иванов Иван (#12)',
        );
    });
});
