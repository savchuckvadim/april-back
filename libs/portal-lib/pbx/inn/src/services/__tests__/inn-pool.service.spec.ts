import { InnPoolService } from '../inn-pool.service';
import { IInnObservation, INN_SOURCE_KINDS } from '../../type/inn.type';

const INN = '7707083893';
const OTHER = '7812032055';

type Row = Record<string, unknown>;

interface ICall {
    method: string;
    params: Row;
}

/** Портал, где поля ИНН установлены на сделке и компании. */
const portal = {
    getEntityFieldByCode: (_entity: string, code: string) =>
        code === 'op_inn'
            ? { bitrixId: 'OP_INN' }
            : code === 'op_inn_pool'
              ? { bitrixId: 'OP_INN_POOL' }
              : undefined,
    getFieldBitrixId: (field: { bitrixId: string }) =>
        `UF_CRM_${field.bitrixId}`,
} as never;

function makeBitrix(rows: Record<string, unknown> = {}): {
    bitrix: { api: { call: (m: string, p: Row) => Promise<unknown> } };
    calls: ICall[];
} {
    const calls: ICall[] = [];
    return {
        calls,
        bitrix: {
            api: {
                call: (method: string, params: Row): Promise<unknown> => {
                    calls.push({ method, params });
                    return Promise.resolve({ result: rows[method] ?? [] });
                },
            },
        },
    };
}

const observation = (
    inn: string,
    kind: IInnObservation['kind'],
): IInnObservation => ({ inn, kind });

const dealFieldsOf = (calls: ICall[]): Row => {
    const update = calls.find(call => call.method === 'crm.deal.update');
    return (update?.params.fields ?? {}) as Row;
};

describe('InnPoolService', () => {
    it('один надёжный кандидат в пустой ИНН — ставится автоматикой', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        const result = await service.absorb(100, { ID: '100' }, [
            observation(INN, INN_SOURCE_KINDS.company_requisite),
        ]);

        expect(dealFieldsOf(calls).UF_CRM_OP_INN).toBe(INN);
        expect(dealFieldsOf(calls).UF_CRM_OP_INN_POOL).toEqual([INN]);
        expect(result.autoSet).toBe(true);
        // Автоподстановка обязана оставить след: иначе её не отличить от
        // выбора человека.
        expect(
            calls.some(call => call.method === 'crm.timeline.comment.add'),
        ).toBe(true);
    });

    it('кандидатов несколько — пул пополняется, ИНН остаётся пустым', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        const result = await service.absorb(100, { ID: '100' }, [
            observation(INN, INN_SOURCE_KINDS.company_requisite),
            observation(OTHER, INN_SOURCE_KINDS.lead_field),
        ]);

        expect(dealFieldsOf(calls).UF_CRM_OP_INN).toBeUndefined();
        expect(dealFieldsOf(calls).UF_CRM_OP_INN_POOL).toEqual([INN, OTHER]);
        expect(result.autoSet).toBe(false);
    });

    it('единственный кандидат из названия — слишком слабо, ИНН не ставим', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.absorb(100, { ID: '100' }, [
            observation(OTHER, INN_SOURCE_KINDS.title),
        ]);

        expect(dealFieldsOf(calls).UF_CRM_OP_INN).toBeUndefined();
        expect(dealFieldsOf(calls).UF_CRM_OP_INN_POOL).toEqual([OTHER]);
    });

    it('выбор человека не перетирается, пул только пополняется', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.absorb(
            100,
            {
                ID: '100',
                UF_CRM_OP_INN: INN,
                UF_CRM_OP_INN_POOL: [INN],
            },
            [observation(OTHER, INN_SOURCE_KINDS.company_requisite)],
        );

        expect(dealFieldsOf(calls).UF_CRM_OP_INN).toBeUndefined();
        expect(dealFieldsOf(calls).UF_CRM_OP_INN_POOL).toEqual([INN, OTHER]);
    });

    it('ничего нового — в Битрикс не ходим вовсе', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.absorb(
            100,
            { ID: '100', UF_CRM_OP_INN: INN, UF_CRM_OP_INN_POOL: [INN] },
            [observation(INN, INN_SOURCE_KINDS.deal_field)],
        );

        expect(calls).toHaveLength(0);
    });

    it('поля не установлены — предупреждение вместо записи', async () => {
        const { bitrix, calls } = makeBitrix();
        const emptyPortal = {
            getEntityFieldByCode: () => undefined,
            getFieldBitrixId: () => '',
        } as never;
        const service = new InnPoolService(bitrix, emptyPortal, 'portal.ru');

        const result = await service.absorb(100, { ID: '100' }, [
            observation(INN, INN_SOURCE_KINDS.company_requisite),
        ]);

        expect(calls).toHaveLength(0);
        expect(result.warnings[0]).toContain('op_inn');
    });

    it('пул компании синхронизируется из боевого пути', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.company.get': { ID: '55' },
        });
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.absorb(100, { ID: '100', COMPANY_ID: '55' }, [
            observation(INN, INN_SOURCE_KINDS.company_requisite),
        ]);

        const update = calls.find(call => call.method === 'crm.company.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN_POOL).toEqual([INN]);
        expect(fields.UF_CRM_OP_INN).toBe(INN);
    });

    it('основной ИНН компании не трогаем, если вариантов несколько', async () => {
        const { bitrix, calls } = makeBitrix({
            'crm.company.get': { ID: '55' },
        });
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.syncCompany(55, [INN, OTHER]);

        const update = calls.find(call => call.method === 'crm.company.update');
        const fields = (update?.params.fields ?? {}) as Row;
        expect(fields.UF_CRM_OP_INN_POOL).toEqual([INN, OTHER]);
        expect(fields.UF_CRM_OP_INN).toBeUndefined();
    });

    describe('choose', () => {
        it('пишет выбор, пополняет пул и оставляет запись в таймлайне', async () => {
            const { bitrix, calls } = makeBitrix();
            const service = new InnPoolService(bitrix, portal, 'portal.ru');

            const result = await service.choose(
                100,
                {
                    ID: '100',
                    UF_CRM_OP_INN: OTHER,
                    UF_CRM_OP_INN_POOL: [OTHER],
                },
                INN,
                { id: 12, name: 'Иванов Иван' },
            );

            expect(dealFieldsOf(calls).UF_CRM_OP_INN).toBe(INN);
            expect(dealFieldsOf(calls).UF_CRM_OP_INN_POOL).toEqual([
                OTHER,
                INN,
            ]);
            expect(result.current).toBe(INN);

            const comment = calls.find(
                call => call.method === 'crm.timeline.comment.add',
            );
            const fields = (comment?.params.fields ?? {}) as Row;
            expect(String(fields.COMMENT)).toContain('выбран вручную');
            expect(String(fields.COMMENT)).toContain('Иванов Иван (#12)');
            expect(String(fields.COMMENT)).toContain(`Было: ${OTHER}`);
        });

        it('мусор вместо ИНН до Битрикса не доезжает', async () => {
            const { bitrix, calls } = makeBitrix();
            const service = new InnPoolService(bitrix, portal, 'portal.ru');

            await expect(
                service.choose(100, { ID: '100' }, '1234567890', {
                    id: 12,
                    name: 'Иванов',
                }),
            ).rejects.toThrow('контрольной суммы');
            expect(calls).toHaveLength(0);
        });
    });

    it('скрытие варианта пишется только в таймлайн, поля не трогает', async () => {
        const { bitrix, calls } = makeBitrix();
        const service = new InnPoolService(bitrix, portal, 'portal.ru');

        await service.hide(100, OTHER, { id: 12, name: 'Иванов' });

        expect(calls.some(call => call.method === 'crm.deal.update')).toBe(
            false,
        );
        const comment = calls.find(
            call => call.method === 'crm.timeline.comment.add',
        );
        expect(String((comment?.params.fields as Row).COMMENT)).toContain(
            'вариант скрыт',
        );
    });
});
