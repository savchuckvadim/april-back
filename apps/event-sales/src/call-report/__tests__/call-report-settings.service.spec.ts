import { CallReportSettingsService } from '../services/call-report-settings.service';

/** Полный набор настроек портала: все поля не заданы. */
const emptyPortalSettings = () => ({
    enabled: null,
    deepAnalysisEnabled: null,
    createSmartEnabled: null,
    classifyEnabled: null,
    salesOnly: null,
    minDurationSec: null,
    windowHours: null,
    maxPerRun: null,
    staleMinutes: null,
    llmModel: null,
    deepAnalysisModel: null,
    scanIntervalMinutes: null,
    nightScanIntervalMinutes: null,
    nightStartHour: null,
    nightEndHour: null,
    lastScanAt: null,
    allowedUserIds: null,
    irrelevantConfidence: null,
    revisorEnabled: null,
});

const makeDeps = (options?: {
    portal?: Record<string, unknown> | null;
    dbError?: boolean;
}) => {
    const portalAiSettings = {
        getByDomain: options?.dbError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(options?.portal ?? null),
    };
    const service = new CallReportSettingsService(portalAiSettings as never);
    return { service, portalAiSettings };
};

describe('CallReportSettingsService (портал → дефолт кода, env-слоя нет)', () => {
    afterEach(() => jest.clearAllMocks());

    it('без настроек портала действуют дефолты кода, портал ВЫКЛЮЧЕН', async () => {
        const { service } = makeDeps();

        const settings = await service.resolve('gsr.bitrix24.ru');

        // Главное следствие отказа от env: без строки в БД портал не
        // обрабатывается — включение только из админки.
        expect(settings.enabled).toBe(false);
        expect(settings.minDurationSec).toBe(300);
        expect(settings.windowHours).toBe(25);
        expect(settings.maxPerRun).toBe(10);
        expect(settings.staleMinutes).toBe(90);
        expect(settings.llmModel).toBe('gigachat');
        expect(settings.irrelevantConfidence).toBe(0.7);
        expect(settings.revisorEnabled).toBe(false);
        expect(settings.deepAnalysisEnabled).toBe(true);
        expect(settings.createSmartEnabled).toBe(true);
        expect(settings.classifyEnabled).toBe(true);
        expect(settings.salesOnly).toBe(true);
        expect(settings.source).toBe('default');
    });

    it('заданные поля портала перекрывают дефолты, незаданные — нет', async () => {
        const { service } = makeDeps({
            portal: {
                ...emptyPortalSettings(),
                enabled: true,
                minDurationSec: 60,
                irrelevantConfidence: 0.9,
                revisorEnabled: true,
                deepAnalysisEnabled: false,
            },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.enabled).toBe(true);
        expect(settings.minDurationSec).toBe(60);
        expect(settings.irrelevantConfidence).toBe(0.9);
        expect(settings.revisorEnabled).toBe(true);
        expect(settings.deepAnalysisEnabled).toBe(false);
        expect(settings.windowHours).toBe(25); // дефолт кода
        expect(settings.source).toBe('portal');
    });

    it('недоступная БД не роняет конвейер — дефолты (портал выключен)', async () => {
        const { service } = makeDeps({ dbError: true });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.enabled).toBe(false);
        expect(settings.source).toBe('default');
    });

    it('параметры расписания без дефолтов: null = каждый тик / без ночного окна', async () => {
        const { service } = makeDeps({
            portal: {
                ...emptyPortalSettings(),
                scanIntervalMinutes: 60,
                nightStartHour: 22,
                nightEndHour: 6,
            },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.scanIntervalMinutes).toBe(60);
        expect(settings.nightStartHour).toBe(22);
        expect(settings.nightEndHour).toBe(6);
        expect(service.globals()).toMatchObject({
            scanIntervalMinutes: null,
            nightScanIntervalMinutes: null,
        });
    });

    it('демо-список сотрудников берётся с портала', async () => {
        const { service } = makeDeps({
            portal: { ...emptyPortalSettings(), allowedUserIds: [222, 323] },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.allowedUserIds).toEqual([222, 323]);
    });
});
