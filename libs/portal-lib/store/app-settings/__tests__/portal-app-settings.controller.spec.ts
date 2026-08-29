import { PortalAppSettingsController } from '../portal-app-settings.controller';
import { PortalAppSettingsService } from '../portal-app-settings.service';
import { EnumPortalAppCode } from '../portal-app-settings.schema';

/**
 * Админский ответ: у каждого ключа рядом с дефолтом кода едет признак
 * `stored` — «значение задано на портале». Это та же правда, что фрейм
 * получает списком storedKeys, поэтому считается одной функцией реестра:
 * иначе админка показывала бы «настроено» там, где фрейм настройку не
 * применяет.
 */
describe('PortalAppSettingsController: признак stored', () => {
    const makeController = (settings: Record<string, unknown>) => {
        const listByPortal = jest.fn(() =>
            Promise.resolve([
                {
                    portalId: 7,
                    domain: 'gsr.bitrix24.ru',
                    appCode: EnumPortalAppCode.eventSales,
                    settings,
                    updatedAt: null,
                },
            ]),
        );
        const controller = new PortalAppSettingsController({
            listByPortal,
        } as unknown as PortalAppSettingsService);
        return { controller, listByPortal };
    };

    const findSetting = async (
        settings: Record<string, unknown>,
        code: string,
    ) => {
        const { controller } = makeController(settings);
        const response = await controller.list(7);
        const block = response.apps.find(
            app => app.appCode === EnumPortalAppCode.eventSales,
        );
        return block?.settings.find(setting => setting.code === code);
    };

    it('сохранённый ключ: stored = true и своё значение', async () => {
        const setting = await findSetting({ with_tm: true }, 'with_tm');

        expect(setting?.stored).toBe(true);
        expect(setting?.value).toBe(true);
    });

    it('несохранённый ключ: stored = false, value = null, дефолт кода на месте', async () => {
        const setting = await findSetting({ with_tm: true }, 'with_no_plan');

        expect(setting?.stored).toBe(false);
        expect(setting?.value).toBeNull();
        expect(setting?.default).toBe(false);
    });

    it('значение чужого типа заданным не считается', async () => {
        const setting = await findSetting({ with_tm: 'да' }, 'with_tm');

        expect(setting?.stored).toBe(false);
        expect(setting?.value).toBeNull();
    });

    /**
     * Выключатель анкет по типам события — первый ключ-список. Админке
     * нужны и справочник значений, и признак «это список»: без них она
     * нарисовала бы текстовое поле, и владелец вписал бы туда что угодно.
     */
    it('выключатель анкет едет со справочником типов и признаком списка', async () => {
        const setting = await findSetting(
            { questionnaires_disabled_event_types: 'presentation,hot' },
            'questionnaires_disabled_event_types',
        );

        expect(setting?.isList).toBe(true);
        expect(setting?.value).toBe('presentation,hot');
        expect(setting?.options).toEqual(
            expect.arrayContaining([
                { code: 'presentation', name: 'Презентация' },
                { code: 'hot', name: 'Решение' },
            ]),
        );
    });

    it('обычному ключу справочник и признак списка не приезжают', async () => {
        const setting = await findSetting({ with_tm: true }, 'with_tm');

        expect(setting?.options).toBeUndefined();
        expect(setting?.isList).toBeUndefined();
    });

    it('строки настроек у портала нет — заданных ключей нет вообще', async () => {
        const listByPortal = jest.fn(() => Promise.resolve([]));
        const controller = new PortalAppSettingsController({
            listByPortal,
        } as unknown as PortalAppSettingsService);

        const response = await controller.list(7);

        const stored = response.apps.flatMap(app =>
            app.settings.filter(setting => setting.stored),
        );
        expect(stored).toEqual([]);
    });
});
