import { FlowBitrix } from '../../shared/side-flow';
import { ZprBacklinkService } from '../services/zpr-backlink.service';
import { BxRow } from '../types/zpr-flow-run.type';
import { job, makeInfo, makePortal } from './zpr-flow.fixtures';

/**
 * Обратная ссылка op_zprs на сделке и компании: элемент и так находится по
 * своим crm-полям, поэтому запись сюда — удобство, и падать она обязана
 * тихо. Формат ссылки — динамическая привязка `T{hex(entityTypeId)}_{id}`
 * (1038 → 40e).
 */
describe('ZprBacklinkService', () => {
    const makeFake = (over?: {
        /** Текущее значение op_zprs на сделке. */
        dealZprs?: unknown;
        /** Чтение сделки падает. */
        readFails?: boolean;
    }) => {
        const updates: Array<{ id: number; fields: BxRow }> = [];
        const bitrix = {
            deal: {
                get: () =>
                    over?.readFails
                        ? Promise.reject(new Error('битрикс лёг'))
                        : Promise.resolve({
                              result: {
                                  ID: '100',
                                  UF_CRM_OP_ZPRS: over?.dealZprs ?? ['T40e_1'],
                              },
                          }),
                update: (id: number, fields: BxRow) => {
                    updates.push({ id, fields });
                    return Promise.resolve({ result: true });
                },
            },
            company: {
                get: () => Promise.resolve({ result: { ID: '431' } }),
                update: (id: number, fields: BxRow) => {
                    updates.push({ id, fields });
                    return Promise.resolve({ result: true });
                },
            },
        } as unknown as FlowBitrix;
        return { bitrix, updates };
    };

    it('ссылка дописывается и на сделку, и на компанию (append)', async () => {
        const { bitrix, updates } = makeFake();
        const service = new ZprBacklinkService(bitrix, makePortal());

        await service.appendOpZprs(makeInfo(), job(), 601);

        expect(updates).toHaveLength(2);
        // Существующие ссылки сохранены, новая дописана в хвост.
        expect(updates[0]).toEqual({
            id: 100,
            fields: { UF_CRM_OP_ZPRS: ['T40e_1', 'T40e_601'] },
        });
        expect(updates[1]).toEqual({
            id: 431,
            fields: { UF_CRM_OP_ZPRS: ['T40e_601'] },
        });
    });

    it('ссылка уже есть — повторный джоб дубль не заводит', async () => {
        const { bitrix, updates } = makeFake({ dealZprs: ['T40e_601'] });
        const service = new ZprBacklinkService(bitrix, makePortal());

        await service.appendOpZprs(makeInfo(), job(), 601);

        // Сделку не трогаем вовсе, компания своей ссылки ещё не знает.
        expect(updates).toEqual([
            { id: 431, fields: { UF_CRM_OP_ZPRS: ['T40e_601'] } },
        ]);
    });

    it('поля op_zprs нет в реестре портала — записывать некуда', async () => {
        const { bitrix, updates } = makeFake();
        const service = new ZprBacklinkService(
            bitrix,
            makePortal({ zprsField: false }),
        );

        await service.appendOpZprs(makeInfo(), job(), 601);

        expect(updates).toHaveLength(0);
    });

    it('сущности нет в джобе — цель пропускается', async () => {
        const { bitrix, updates } = makeFake();
        const service = new ZprBacklinkService(bitrix, makePortal());

        await service.appendOpZprs(
            makeInfo(),
            job({ baseDealId: null, companyId: null }),
            601,
        );

        expect(updates).toHaveLength(0);
    });

    it('ошибка Битрикса гасится в warn и не роняет джоб', async () => {
        const { bitrix, updates } = makeFake({ readFails: true });
        const service = new ZprBacklinkService(bitrix, makePortal());
        const warn = jest
            .spyOn(service['logger'], 'warn')
            .mockImplementation(() => undefined);

        await expect(
            service.appendOpZprs(makeInfo(), job(), 601),
        ).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalled();
        // Компания отработала штатно — падение одной цели не рвёт цикл.
        expect(updates).toHaveLength(1);
    });
});
