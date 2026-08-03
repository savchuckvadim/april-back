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
});

const makeDeps = (options?: {
    portal?: Record<string, unknown> | null;
    env?: Record<string, string>;
    dbError?: boolean;
}) => {
    const portalAiSettings = {
        getByDomain: options?.dbError
            ? jest.fn().mockRejectedValue(new Error('db down'))
            : jest.fn().mockResolvedValue(options?.portal ?? null),
    };
    const configService = {
        get: jest.fn((key: string) => options?.env?.[key]),
    };
    const service = new CallReportSettingsService(
        portalAiSettings as never,
        configService as never,
    );
    return { service, portalAiSettings };
};

describe('CallReportSettingsService (портал → env → дефолт кода)', () => {
    afterEach(() => jest.clearAllMocks());

    it('без настроек портала и без env берутся дефолты кода', async () => {
        const { service } = makeDeps();

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.minDurationSec).toBe(300);
        expect(settings.windowHours).toBe(25);
        expect(settings.maxPerRun).toBe(10);
        expect(settings.staleMinutes).toBe(90);
        expect(settings.llmModel).toBe('gigachat');
        expect(settings.source).toBe('global');
    });

    it('env перекрывает дефолты кода', async () => {
        const { service } = makeDeps({
            env: {
                CALL_REPORT_MIN_DURATION_SEC: '120',
                CALL_REPORT_LLM_MODEL: 'cloudru',
            },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.minDurationSec).toBe(120);
        expect(settings.llmModel).toBe('cloudru');
    });

    it('настройка портала перекрывает env', async () => {
        const { service } = makeDeps({
            portal: { ...emptyPortalSettings(), minDurationSec: 60 },
            env: { CALL_REPORT_MIN_DURATION_SEC: '120' },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.minDurationSec).toBe(60);
        expect(settings.source).toBe('portal');
    });

    it('незаданное поле портала падает в env, заданное — нет', async () => {
        const { service } = makeDeps({
            portal: { ...emptyPortalSettings(), maxPerRun: 50 },
            env: {
                CALL_REPORT_MAX_PER_RUN: '10',
                CALL_REPORT_WINDOW_HOURS: '48',
            },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.maxPerRun).toBe(50); // из портала
        expect(settings.windowHours).toBe(48); // из env
    });

    it('тумблеры: false на портале выигрывает у включённого по умолчанию env', async () => {
        const { service } = makeDeps({
            portal: {
                ...emptyPortalSettings(),
                deepAnalysisEnabled: false,
                salesOnly: false,
            },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.deepAnalysisEnabled).toBe(false);
        expect(settings.salesOnly).toBe(false);
        // Не заданный на портале тумблер остаётся включённым по конвенции env
        expect(settings.createSmartEnabled).toBe(true);
    });

    it('env-нуль выключает тумблер, когда портал молчит', async () => {
        const { service } = makeDeps({
            env: { CALL_REPORT_DEEP_ANALYSIS_ENABLED: '0' },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.deepAnalysisEnabled).toBe(false);
    });

    it('мусор в env игнорируется в пользу дефолта кода', async () => {
        const { service } = makeDeps({
            env: { CALL_REPORT_WINDOW_HOURS: 'нет' },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.windowHours).toBe(25);
    });

    it('недоступная БД не роняет конвейер — работаем на глобальных', async () => {
        const { service } = makeDeps({
            dbError: true,
            env: { CALL_REPORT_MIN_DURATION_SEC: '120' },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.minDurationSec).toBe(120);
        expect(settings.source).toBe('global');
    });

    it('параметры расписания есть только у портала, глобального аналога нет', async () => {
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
        expect(service.globals()).toMatchObject({ scanIntervalMinutes: null });
    });

    it('демо-список сотрудников берётся с портала вместо суффикса в env', async () => {
        const { service } = makeDeps({
            portal: { ...emptyPortalSettings(), allowedUserIds: [222, 323] },
        });

        const settings = await service.resolve('gsr.bitrix24.ru');

        expect(settings.allowedUserIds).toEqual([222, 323]);
    });
});
