import { RejectReviveScheduler } from '../reject-revive.scheduler';

const DOMAIN = 'a.bitrix24.ru';

/**
 * Гейт рабочего времени. Он невидим снаружи: если сломается, реанимация
 * просто начнёт ставить клиентам звонки ночью и в праздники — без ошибок в
 * логах. Поэтому проверяем именно факт «сервис не позван».
 */
const makeDeps = (options?: {
    workingTime?: boolean;
    enabled?: boolean;
    lockTaken?: boolean;
}) => {
    const redisClient = {
        set: jest.fn().mockResolvedValue(options?.lockTaken ? null : 'OK'),
        del: jest.fn().mockResolvedValue(1),
    };
    const reviveService = {
        runForDomain: jest.fn().mockResolvedValue({
            resent: 0,
            queued: 0,
            revived: 0,
            warnings: [],
        }),
    };
    const appSettings = {
        listByAppCode: jest
            .fn()
            .mockResolvedValue([
                { domain: DOMAIN, settings: { revive: true } },
            ]),
        resolve: jest.fn().mockResolvedValue({
            rejectReviveEnabled: options?.enabled ?? true,
            rejectReviveIntervalDays: 120,
            rejectReviveAssignMode: 'same',
            rejectReviveMaxPerRun: 10,
            rejectReviveUsePostFailDate: false,
            rejectReviveResendAfterMinutes: 30,
        }),
    };
    const workingHours = {
        isWorkingTime: jest
            .fn()
            .mockResolvedValue(options?.workingTime ?? true),
    };

    const scheduler = new RejectReviveScheduler(
        { getClient: () => redisClient } as never,
        reviveService as never,
        appSettings as never,
        workingHours as never,
    );
    return { scheduler, reviveService, workingHours, redisClient };
};

/*
 * Планировщик читает список доменов из настроек, где ключ включённости
 * берётся из схемы. Мок отдаёт строку с любым ключом, поэтому домены
 * отфильтруются — подменяем список явно там, где это важно.
 */
jest.mock('@lib/portal-lib/store/app-settings', () => ({
    EnumPortalAppCode: { eventSales: 'event-sales' },
    PORTAL_APP_SETTINGS_SCHEMA: {
        'event-sales': { rejectReviveEnabled: { code: 'revive' } },
    },
    PortalAppSettingsService: class {},
}));

describe('RejectReviveScheduler — гейт рабочего времени', () => {
    it('в рабочее время реанимация запускается', async () => {
        const { scheduler, reviveService, workingHours } = makeDeps({
            workingTime: true,
        });

        await scheduler.tick();

        expect(workingHours.isWorkingTime).toHaveBeenCalledWith(DOMAIN);
        expect(reviveService.runForDomain).toHaveBeenCalledTimes(1);
    });

    it('вне рабочего времени портала — НЕ запускается', async () => {
        const { scheduler, reviveService } = makeDeps({ workingTime: false });

        await scheduler.tick();

        expect(reviveService.runForDomain).not.toHaveBeenCalled();
    });

    it('лок освобождается и когда все домены отсеяны по времени', async () => {
        const { scheduler, redisClient } = makeDeps({ workingTime: false });

        await scheduler.tick();

        expect(redisClient.del).toHaveBeenCalled();
    });

    it('выключенная настройка проверяется ДО календаря — лишних вызовов нет', async () => {
        const { scheduler, workingHours, reviveService } = makeDeps({
            enabled: false,
        });

        await scheduler.tick();

        expect(workingHours.isWorkingTime).not.toHaveBeenCalled();
        expect(reviveService.runForDomain).not.toHaveBeenCalled();
    });

    it('чужой тик держит лок — календарь не читаем вовсе', async () => {
        const { scheduler, workingHours } = makeDeps({ lockTaken: true });

        await scheduler.tick();

        expect(workingHours.isWorkingTime).not.toHaveBeenCalled();
    });
});
