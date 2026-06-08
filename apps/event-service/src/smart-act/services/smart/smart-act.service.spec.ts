import { SmartActService } from './smart-act.service';
import { CategorySmartActService } from './category-smart-act.service';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Стадии смарта «Акт» как на gsr-портале (роль → STATUS_ID, SORT):
 * Запланирован(PREPARATION,20) < Выписан(CLIENT,30) < У клиента(31) < Оплачен(32) < Сдан(SUCCESS,40).
 */
const STAGES = [
    { STATUS_ID: 'DT1044_21:NEW', SORT: 10, CATEGORY_ID: 21 },
    { STATUS_ID: 'DT1044_21:PREPARATION', SORT: 20, CATEGORY_ID: 21 },
    { STATUS_ID: 'DT1044_21:CLIENT', SORT: 30, CATEGORY_ID: 21 },
    { STATUS_ID: 'DT1044_21:UC_980XQ7', SORT: 31, CATEGORY_ID: 21 }, // У клиента
    { STATUS_ID: 'DT1044_21:UC_PATLI3', SORT: 32, CATEGORY_ID: 21 }, // Оплачен
    { STATUS_ID: 'DT1044_21:SUCCESS', SORT: 40, CATEGORY_ID: 21 },
];

const findStage = (statusId: string) =>
    STAGES.find(s => s.STATUS_ID === statusId)!;

function buildService(updateMock: jest.Mock) {
    const bitrix = {
        item: { update: updateMock },
    } as unknown as BitrixService;

    const portalModel = {
        getSmartByType: () => ({
            entityTypeId: 1044,
            crm: 'T41_',
            categories: [{ id: 21 }],
        }),
    } as unknown as PortalModel;

    const categorySmartActService = {
        getSmartStageDataForCreate: jest.fn().mockResolvedValue({
            new: { stage: findStage('DT1044_21:NEW'), category: null },
            planned: {
                stage: findStage('DT1044_21:PREPARATION'),
                category: null,
            },
            inwork: { stage: findStage('DT1044_21:CLIENT'), category: null },
            success: { stage: findStage('DT1044_21:SUCCESS'), category: null },
        }),
        getCategorySmartAct: jest
            .fn()
            .mockResolvedValue({ category: { id: 21 }, stages: STAGES }),
    } as unknown as CategorySmartActService;

    return new SmartActService(
        'gsr.bitrix24.ru',
        bitrix,
        portalModel,
        categorySmartActService,
    );
}

describe('SmartActService.ensureStageForward', () => {
    it('двигает Запланирован → Выписан (вперёд по SORT)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(
            777,
            'DT1044_21:PREPARATION',
            'inwork',
        );

        expect(changed).toBe(true);
        expect(update).toHaveBeenCalledWith(777, 1044, {
            stageId: 'DT1044_21:CLIENT',
        });
    });

    it('закрывает Выписан → Сдан (success)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(
            5,
            'DT1044_21:CLIENT',
            'success',
        );

        expect(changed).toBe(true);
        expect(update).toHaveBeenCalledWith(5, 1044, {
            stageId: 'DT1044_21:SUCCESS',
        });
    });

    it('НЕ откатывает ручную «Оплачен» назад в «Выписан» (target inwork)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(
            9,
            'DT1044_21:UC_PATLI3', // Оплачен, SORT 32 > 30
            'inwork',
        );

        expect(changed).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });

    it('НЕ реанимирует уже закрытый Сдан (target success)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(
            1,
            'DT1044_21:SUCCESS',
            'success',
        );

        expect(changed).toBe(false);
        expect(update).not.toHaveBeenCalled();
    });

    it('двигает «Оплачен» → Сдан, когда месяц прошёл (target success)', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(
            3,
            'DT1044_21:UC_PATLI3', // Оплачен, SORT 32 < 40
            'success',
        );

        expect(changed).toBe(true);
        expect(update).toHaveBeenCalledWith(3, 1044, {
            stageId: 'DT1044_21:SUCCESS',
        });
    });

    it('неизвестная/пустая текущая стадия — двигает в целевую', async () => {
        const update = jest.fn().mockResolvedValue({});
        const service = buildService(update);

        const changed = await service.ensureStageForward(2, null, 'planned');

        expect(changed).toBe(true);
        expect(update).toHaveBeenCalledWith(2, 1044, {
            stageId: 'DT1044_21:PREPARATION',
        });
    });
});
