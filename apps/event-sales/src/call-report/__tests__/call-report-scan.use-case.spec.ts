import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import { VoximplantCallsService } from '../services/voximplant-calls.service';

jest.mock('../services/voximplant-calls.service');

const MockedVoximplant = VoximplantCallsService as jest.MockedClass<
    typeof VoximplantCallsService
>;

const DOMAIN = 'test.bitrix24.ru';

const row = (activityId: number, overrides?: Record<string, unknown>) => ({
    CALL_ID: `call_${activityId}`,
    CRM_ACTIVITY_ID: activityId,
    PORTAL_USER_ID: 7,
    CALL_DURATION: 700,
    CALL_START_DATE: '2026-07-21T10:00:00+03:00',
    ...overrides,
});

const activity = (ownerTypeId: number, withFiles = true) => ({
    ID: '1',
    OWNER_ID: '555',
    OWNER_TYPE_ID: String(ownerTypeId),
    FILES: withFiles ? [{ id: 9, url: 'http://f' }] : undefined,
});

describe('CallReportScanUseCase', () => {
    const makeDeps = (options: {
        rows: ReturnType<typeof row>[];
        busy?: string[];
        activityById?: Record<number, unknown>;
        salesUserIds?: number[];
    }) => {
        MockedVoximplant.mockImplementation(
            () =>
                ({
                    findRecentCalls: jest.fn().mockResolvedValue(options.rows),
                }) as never,
        );
        const getActivityById = jest.fn((id: number) =>
            Promise.resolve(options.activityById?.[id] ?? activity(2)),
        );
        const pbxService = {
            init: jest.fn().mockResolvedValue({
                bitrix: {
                    activity: {
                        getAllFresh: jest.fn(
                            async (filter: { ID: number }) => ({
                                activities: [
                                    await getActivityById(filter.ID),
                                ].filter(Boolean),
                            }),
                        ),
                    },
                },
            }),
        };
        const store = {
            filterBusyDedupKeys: jest
                .fn()
                .mockResolvedValue(new Set(options.busy ?? [])),
        };
        const dispatcher = { dispatch: jest.fn().mockResolvedValue({}) };
        const config = { get: jest.fn(() => undefined) };
        const bxDepartment = {
            getFullDepartment: jest.fn().mockResolvedValue({
                department: {
                    allUsers: (options.salesUserIds ?? [7]).map(id => ({
                        ID: String(id),
                    })),
                },
            }),
        };
        const useCase = new CallReportScanUseCase(
            pbxService as never,
            store as never,
            dispatcher as never,
            config as never,
            bxDepartment as never,
        );
        return { useCase, dispatcher, store, bxDepartment };
    };

    afterEach(() => jest.clearAllMocks());

    it('новый звонок сделки ставится в очередь с dedup-ключом как jobId', async () => {
        const { useCase, dispatcher } = makeDeps({ rows: [row(101)] });
        const result = await useCase.execute(DOMAIN);
        expect(result.enqueued).toBe(1);
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-transcribe',
            expect.objectContaining({
                domain: DOMAIN,
                activityId: 101,
                dealId: 555,
                durationSec: 700,
            }),
            `${DOMAIN}:101`,
            expect.objectContaining({ attempts: 2 }),
        );
    });

    it('уже обработанные звонки отсеиваются дедупом', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101), row(102)],
            busy: [`${DOMAIN}:101`],
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.alreadyProcessed).toBe(1);
        expect(result.enqueued).toBe(1);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('звонки не по сделке пропускаются (MVP)', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101)],
            activityById: { 101: activity(3) },
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.skippedNonDeal).toBe(1);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('звонки без аудиофайла пропускаются', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101)],
            activityById: { 101: activity(2, false) },
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.skippedNoAudio).toBe(1);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('maxPerRun ограничивает число задач за скан', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101), row(102), row(103)],
        });
        const result = await useCase.execute(DOMAIN, { maxPerRun: 2 });
        expect(result.enqueued).toBe(2);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
    });

    it('звонки не менеджеров отдела продаж отсеиваются фильтром департамента', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101, { PORTAL_USER_ID: 999 }), row(102)],
            salesUserIds: [7],
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.skippedNotSales).toBe(1);
        expect(result.enqueued).toBe(1);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('при недоступном bx-department скан работает без фильтра (fail-open)', async () => {
        const { useCase, dispatcher, bxDepartment } = makeDeps({
            rows: [row(101, { PORTAL_USER_ID: 999 })],
        });
        bxDepartment.getFullDepartment.mockRejectedValue(
            new Error('department api down'),
        );
        const result = await useCase.execute(DOMAIN);
        expect(result.skippedNotSales).toBe(0);
        expect(result.enqueued).toBe(1);
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('строки без CRM_ACTIVITY_ID игнорируются', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101, { CRM_ACTIVITY_ID: undefined })],
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.enqueued).toBe(0);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
});
