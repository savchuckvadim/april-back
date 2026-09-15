import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { COMPLECT_VARIANT_STAGE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ComplectVariantLifecycleService } from '../services/complect-variant-lifecycle.service';

/**
 * Судьба варианта: уехал в поставку — «Успех», остался — «Не состоялся».
 * Сервис best-effort: любая дырка на портале даёт пропуск, а не исключение.
 */
describe('ComplectVariantLifecycleService', () => {
    const ENTITY_TYPE_ID = 1046;

    const portalModelWith = (
        smart: { entityTypeId: number } | undefined,
    ): PortalModel =>
        ({ getSmartByType: () => smart }) as unknown as PortalModel;

    /** stageById — текущая стадия элемента; по умолчанию «Черновик». */
    const makeBitrix = (stageById: Record<number, string | null> = {}) => {
        const itemGet = jest.fn().mockImplementation((id: string) => {
            const stageId =
                Number(id) in stageById
                    ? stageById[Number(id)]
                    : 'DT1046_3:DRAFT';
            return Promise.resolve({
                result: { item: { id: Number(id), stageId } },
            });
        });
        const itemUpdate = jest
            .fn()
            .mockImplementation((id: number) =>
                Promise.resolve({ result: { item: { id } } }),
            );

        const bitrix = {
            item: { get: itemGet, update: itemUpdate },
        } as unknown as BitrixService;

        return { bitrix, itemGet, itemUpdate };
    };

    const makeService = (bitrix: BitrixService) =>
        new ComplectVariantLifecycleService(
            bitrix,
            portalModelWith({ entityTypeId: ENTITY_TYPE_ID }),
        );

    it('уехавшие варианты закрываются успехом, стадия считается от текущей', async () => {
        const { bitrix, itemUpdate } = makeBitrix();
        const service = makeService(bitrix);

        const result = await service.markSuccess('d.ru', [5001, 5002]);

        expect(result).toEqual({ requested: 2, moved: 2, skipped: 0 });
        expect(itemUpdate).toHaveBeenCalledTimes(2);
        const [id, entityTypeId, fields] = itemUpdate.mock.calls[0] as [
            number,
            number,
            { stageId: string },
        ];
        expect(id).toBe(5001);
        expect(entityTypeId).toBe(ENTITY_TYPE_ID);
        // воронка берётся у элемента (здесь _3, а не дефолтная _1)
        expect(fields.stageId).toBe('DT1046_3:SUCCESS');
    });

    it('неуехавшие закрываются «Не состоялся», а не «Отклонён»', async () => {
        const { bitrix, itemUpdate } = makeBitrix();
        const service = makeService(bitrix);

        await service.markRejected('d.ru', [5003]);

        const [, , fields] = itemUpdate.mock.calls[0] as [
            number,
            number,
            { stageId: string },
        ];
        // «Отклонён» — ручное решение менеджера, робот его не пишет
        expect(fields.stageId).toBe('DT1046_3:FAILED');
        expect(fields.stageId).not.toContain('REJECTED');
    });

    it('смарт на портале не установлен — тихо ничего не делаем', async () => {
        const { bitrix, itemGet, itemUpdate } = makeBitrix();
        const service = new ComplectVariantLifecycleService(
            bitrix,
            portalModelWith(undefined),
        );

        const result = await service.markSuccess('d.ru', [5001]);

        expect(result).toEqual({ requested: 1, moved: 0, skipped: 1 });
        expect(itemGet).not.toHaveBeenCalled();
        expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('пустой список — в Битрикс не ходим вовсе', async () => {
        const { bitrix, itemGet } = makeBitrix();
        const service = makeService(bitrix);

        expect(await service.markSuccess('d.ru', [])).toEqual({
            requested: 0,
            moved: 0,
            skipped: 0,
        });
        expect(itemGet).not.toHaveBeenCalled();
    });

    it('у элемента нет стадии — двигать нечего, исключения нет', async () => {
        const { bitrix, itemUpdate } = makeBitrix({ 5001: null });
        const service = makeService(bitrix);

        expect(await service.markSuccess('d.ru', [5001])).toEqual({
            requested: 1,
            moved: 0,
            skipped: 1,
        });
        expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('элемент уже на нужной стадии — лишний update не шлём', async () => {
        const { bitrix, itemUpdate } = makeBitrix({
            5001: 'DT1046_3:SUCCESS',
        });
        const service = makeService(bitrix);

        expect(await service.markSuccess('d.ru', [5001])).toEqual({
            requested: 1,
            moved: 0,
            skipped: 1,
        });
        expect(itemUpdate).not.toHaveBeenCalled();
    });

    it('падение по одному элементу не срывает остальные', async () => {
        const { bitrix, itemGet, itemUpdate } = makeBitrix();
        itemGet.mockRejectedValueOnce(new Error('403 access denied'));
        const service = makeService(bitrix);

        expect(await service.markSuccess('d.ru', [5001, 5002])).toEqual({
            requested: 2,
            moved: 1,
            skipped: 1,
        });
        expect(itemUpdate).toHaveBeenCalledTimes(1);
    });

    it('дубли id двигают элемент один раз', async () => {
        const { bitrix, itemUpdate } = makeBitrix();
        const service = makeService(bitrix);

        expect(await service.markSuccess('d.ru', [5001, 5001, 0])).toEqual({
            requested: 1,
            moved: 1,
            skipped: 0,
        });
        expect(itemUpdate).toHaveBeenCalledTimes(1);
    });

    it('markStage ставит любую стадию набора, не только финальные', async () => {
        const { bitrix, itemUpdate } = makeBitrix();
        const service = makeService(bitrix);

        await service.markStage('d.ru', [5001], COMPLECT_VARIANT_STAGE.OFFER);

        const [, , fields] = itemUpdate.mock.calls[0] as [
            number,
            number,
            { stageId: string },
        ];
        expect(fields.stageId).toBe('DT1046_3:OFFER');
    });
});
