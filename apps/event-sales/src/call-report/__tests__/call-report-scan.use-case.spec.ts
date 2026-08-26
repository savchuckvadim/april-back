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
        truncated?: boolean;
        total?: number | null;
        departmentError?: boolean;
        /** Бронь не досталась (звонок забрал параллельный скан). */
        claimTaken?: boolean;
        /** Постановка в очередь падает. */
        dispatchError?: boolean;
    }) => {
        const findRecentCalls = jest.fn().mockResolvedValue({
            rows: options.rows,
            truncated: options.truncated ?? false,
            total: options.total ?? options.rows.length,
        });
        MockedVoximplant.mockImplementation(
            () => ({ findRecentCalls }) as never,
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
            // Бронь: по умолчанию удаётся; false — звонок забрал другой скан.
            claimQueued: jest
                .fn()
                .mockResolvedValue(options.claimTaken !== true),
            releaseQueued: jest.fn().mockResolvedValue(true),
        };
        const dispatcher = {
            dispatch: options.dispatchError
                ? jest.fn().mockRejectedValue(new Error('redis down'))
                : jest.fn().mockResolvedValue({}),
        };
        const config = { get: jest.fn(() => undefined) };
        const bxDepartment = {
            getFullDepartment: options.departmentError
                ? jest.fn().mockRejectedValue(new Error('department down'))
                : jest.fn().mockResolvedValue({
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
        return {
            useCase,
            dispatcher,
            store,
            bxDepartment,
            findRecentCalls,
        };
    };

    afterEach(() => jest.clearAllMocks());

    it('фильтр сотрудников уходит В ЗАПРОС Битрикса (пересечение ОП и белого списка)', async () => {
        const { useCase, findRecentCalls } = makeDeps({
            rows: [row(101)],
            salesUserIds: [7, 8, 9],
        });
        await useCase.execute(DOMAIN, { allowedUserIds: [8, 9, 42] });
        // 42 вне отдела продаж — в запрос уходит только пересечение.
        expect(findRecentCalls).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: [8, 9] }),
        );
    });

    it('без белого списка в запрос уходит состав отдела продаж', async () => {
        const { useCase, findRecentCalls } = makeDeps({
            rows: [row(101)],
            salesUserIds: [7, 8],
        });
        await useCase.execute(DOMAIN);
        expect(findRecentCalls).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: [7, 8] }),
        );
    });

    it('отдел продаж недоступен + список не задан → запрос без фильтра сотрудников', async () => {
        const { useCase, findRecentCalls } = makeDeps({
            rows: [row(101)],
            departmentError: true,
        });
        await useCase.execute(DOMAIN);
        expect(findRecentCalls).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: undefined }),
        );
    });

    it('пустое пересечение не сужает запрос, но отсеивает в памяти', async () => {
        const { useCase, dispatcher, findRecentCalls } = makeDeps({
            rows: [row(101)],
            salesUserIds: [7],
        });
        const result = await useCase.execute(DOMAIN, { allowedUserIds: [999] });
        expect(findRecentCalls).toHaveBeenCalledWith(
            expect.objectContaining({ userIds: undefined }),
        );
        expect(result.skippedNotDemo).toBe(1);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('неполная выборка помечается truncated и отдаётся наружу', async () => {
        const { useCase } = makeDeps({
            rows: [row(101)],
            truncated: true,
            total: 5000,
        });
        const result = await useCase.execute(DOMAIN);
        expect(result.truncated).toBe(true);
        expect(result.totalByFilter).toBe(5000);
    });

    it('createSmartItem едет в payload джоба — cron доводит звонок до карточки', async () => {
        const { useCase, dispatcher } = makeDeps({ rows: [row(101)] });
        await useCase.execute(DOMAIN, { createSmartItem: true });
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-transcribe',
            expect.objectContaining({ createSmartItem: true }),
            expect.any(String),
            expect.anything(),
        );
    });

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

    it('в задачу и в бронь уходит id ЗВОНИВШЕГО (PORTAL_USER_ID)', async () => {
        const { useCase, dispatcher, store } = makeDeps({
            rows: [row(101, { PORTAL_USER_ID: 622 })],
            salesUserIds: [622],
        });
        await useCase.execute(DOMAIN, { allowedUserIds: [622] });
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'call-report',
            'call-report-transcribe',
            expect.objectContaining({ callerUserId: 622 }),
            expect.any(String),
            expect.anything(),
        );
        expect(store.claimQueued).toHaveBeenCalledWith(
            expect.objectContaining({ userId: '622' }),
        );
    });

    it('звонок бронируется ДО постановки в очередь (виден дедупу сразу)', async () => {
        const { useCase, store, dispatcher } = makeDeps({ rows: [row(101)] });
        await useCase.execute(DOMAIN);
        expect(store.claimQueued).toHaveBeenCalledWith(
            expect.objectContaining({
                dedupKey: `${DOMAIN}:101`,
                domain: DOMAIN,
                activityId: '101',
                entityType: 'deal',
                app: 'call-report',
            }),
        );
        // Бронь строго раньше постановки.
        const claimOrder = store.claimQueued.mock.invocationCallOrder[0];
        const dispatchOrder = dispatcher.dispatch.mock.invocationCallOrder[0];
        expect(claimOrder).toBeLessThan(dispatchOrder);
    });

    it('бронь досталась другому скану — звонок не ставится повторно', async () => {
        const { useCase, dispatcher } = makeDeps({
            rows: [row(101)],
            claimTaken: true,
        });
        const result = await useCase.execute(DOMAIN);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(result.enqueued).toBe(0);
        expect(result.alreadyProcessed).toBe(1);
    });

    it('постановка упала — бронь снимается, слот не теряется', async () => {
        const { useCase, store } = makeDeps({
            rows: [row(101)],
            dispatchError: true,
        });
        const result = await useCase.execute(DOMAIN);
        expect(store.releaseQueued).toHaveBeenCalledWith(`${DOMAIN}:101`);
        expect(result.enqueued).toBe(0);
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
