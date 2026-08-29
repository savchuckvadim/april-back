import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { AppSettingsController } from '../app-settings.controller';

/**
 * Форма ответа фрейму.
 *
 * Значения лежат ПЛОСКО (старые фреймы, уехавшие на порталы, читают ключи
 * прямо с верхнего уровня — вкладывать их в `values` нельзя), а признак
 * «задано на портале» едет полем-соседом storedKeys: новый фрейм применяет
 * только эти ключи, остальное оставляет на своём доменном значении.
 */
describe('AppSettingsController', () => {
    const makeController = (
        values: Record<string, unknown>,
        storedKeys: string[],
    ) => {
        const resolveWithStored = jest.fn(() =>
            Promise.resolve({ values, storedKeys }),
        );
        const controller = new AppSettingsController({
            resolveWithStored,
        } as unknown as PortalAppSettingsService);
        return { controller, resolveWithStored };
    };

    it('значения плоско + storedKeys рядом', async () => {
        const { controller, resolveWithStored } = makeController(
            { withTM: true, withNoPlan: false, taskGroupId: 41 },
            ['withTM'],
        );

        const response = await controller.resolve(
            EnumPortalAppCode.eventSales,
            'gsr.bitrix24.ru',
        );

        expect(response).toEqual({
            withTM: true,
            withNoPlan: false,
            taskGroupId: 41,
            storedKeys: ['withTM'],
        });
        expect(resolveWithStored).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            EnumPortalAppCode.eventSales,
        );
    });

    it('на портале не задано ничего — пустой список, значения дефолтные', async () => {
        const { controller } = makeController({ withTM: false }, []);

        const response = await controller.resolve(
            EnumPortalAppCode.eventSales,
            'gsr.bitrix24.ru',
        );

        // Ровно тот случай, ради которого признак и заводился: withTM
        // приезжает false, но это дефолт кода — фрейм оставит доменное true.
        expect(response.storedKeys).toEqual([]);
        expect(response.withTM).toBe(false);
    });
});
