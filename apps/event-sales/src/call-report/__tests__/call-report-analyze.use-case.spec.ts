import { CallReportAnalyzeUseCase } from '../use-cases/call-report-analyze.use-case';

/** Активность-звонок сделки 555 с аудио. */
const activity = (id: number, overrides?: Record<string, unknown>) => ({
    ID: String(id),
    OWNER_ID: '555',
    OWNER_TYPE_ID: '2',
    FILES: [{ id: 9, url: 'http://f' }],
    ...overrides,
});

/** Строка voximplant-статистики. */
const voxRow = (overrides?: Record<string, unknown>) => ({
    CALL_ID: 'call-1',
    PORTAL_USER_ID: '7',
    CALL_DURATION: '400',
    CALL_START_DATE: '2026-07-22T10:00:00Z',
    CRM_ACTIVITY_ID: '101',
    ...overrides,
});

const makeDeps = (options?: {
    voxRows?: Record<string, unknown>[];
    activities?: Record<number, Record<string, unknown> | null>;
    busyKeys?: string[];
    pipelineError?: boolean;
}) => {
    const activities = options?.activities ?? { 101: activity(101) };
    const bitrix = {
        activity: {
            // Сигнатура CallAnalysisBitrixService.getActivityById:
            // getAllFresh({ ID }, undefined, 1)
            getAllFresh: jest.fn((filter: { ID: number | string }) => {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- индексация мок-словаря активностей; tsc типизирует корректно, расходится только eslint-программа
                const found = activities[Number(filter.ID)];
                return Promise.resolve({ activities: found ? [found] : [] });
            }),
        },
        api: {
            call: jest
                .fn()
                .mockResolvedValue({ result: options?.voxRows ?? [voxRow()] }),
        },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const pipeline = {
        execute: options?.pipelineError
            ? jest.fn().mockRejectedValue(new Error('pipeline down'))
            : jest.fn().mockImplementation((payload: { activityId: number }) =>
                  Promise.resolve({
                      transcriptionId: `t-${payload.activityId}`,
                      provider: 'bitrix-vibecode',
                      resumeSaved: true,
                      recomendationSaved: true,
                      callType: 'cold',
                  }),
              ),
    };
    const transcriptionStore = {
        filterBusyDedupKeys: jest
            .fn()
            .mockResolvedValue(new Set(options?.busyKeys ?? [])),
    };
    const useCase = new CallReportAnalyzeUseCase(
        pbxService as never,
        pipeline as never,
        transcriptionStore as never,
    );
    return { useCase, pipeline, bitrix };
};

describe('CallReportAnalyzeUseCase', () => {
    afterEach(() => jest.clearAllMocks());

    it('без activityId/dealId/userId — 400', async () => {
        const { useCase } = makeDeps();
        await expect(
            useCase.execute({ domain: 'test.bitrix24.ru' } as never),
        ).rejects.toThrow('укажите dealId или userId');
    });

    it('прямой режим: dealId определяется по владельцу активности', async () => {
        const { useCase, pipeline } = makeDeps();
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            activityId: 101,
        } as never);
        expect(pipeline.execute).toHaveBeenCalledWith(
            expect.objectContaining({ activityId: 101, dealId: 555 }),
        );
        expect(result.mode).toBe('direct');
        expect(result.results[0]).toEqual(
            expect.objectContaining({
                status: 'done',
                transcriptionId: 't-101',
                callType: 'cold',
            }),
        );
    });

    it('прямой режим: активность не сделки — 400 с подсказкой', async () => {
        const { useCase } = makeDeps({
            activities: { 101: activity(101, { OWNER_TYPE_ID: '1' }) },
        });
        await expect(
            useCase.execute({
                domain: 'test.bitrix24.ru',
                activityId: 101,
            } as never),
        ).rejects.toThrow('не сделке');
    });

    it('подбор по userId: берёт последние limit записей менеджера', async () => {
        const { useCase, pipeline } = makeDeps({
            voxRows: [
                voxRow({
                    CRM_ACTIVITY_ID: '101',
                    CALL_START_DATE: '2026-07-20T10:00:00Z',
                }),
                voxRow({
                    CRM_ACTIVITY_ID: '102',
                    CALL_START_DATE: '2026-07-22T10:00:00Z',
                }),
                voxRow({
                    CRM_ACTIVITY_ID: '103',
                    PORTAL_USER_ID: '99', // другой менеджер — мимо
                    CALL_START_DATE: '2026-07-23T10:00:00Z',
                }),
            ],
            activities: { 101: activity(101), 102: activity(102) },
        });
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            userId: 7,
            limit: 1,
        } as never);
        // Свежая запись менеджера 7 — activity 102.
        expect(pipeline.execute).toHaveBeenCalledTimes(1);
        expect(pipeline.execute).toHaveBeenCalledWith(
            expect.objectContaining({ activityId: 102 }),
        );
        expect(result.found).toBe(2);
        expect(result.results).toHaveLength(1);
    });

    it('подбор: maxDurationSec отсекает длинные записи', async () => {
        const { useCase, pipeline } = makeDeps({
            voxRows: [
                voxRow({ CRM_ACTIVITY_ID: '101', CALL_DURATION: '2000' }),
                voxRow({
                    CRM_ACTIVITY_ID: '102',
                    CALL_DURATION: '300',
                    CALL_START_DATE: '2026-07-21T10:00:00Z',
                }),
            ],
            activities: { 102: activity(102) },
        });
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            userId: 7,
            limit: 5,
            maxDurationSec: 900,
        } as never);
        expect(result.found).toBe(1);
        expect(pipeline.execute).toHaveBeenCalledWith(
            expect.objectContaining({ activityId: 102, durationSec: 300 }),
        );
    });

    it('подбор: уже обработанные пропускаются, без аудио — считаются', async () => {
        const { useCase, pipeline } = makeDeps({
            voxRows: [
                voxRow({ CRM_ACTIVITY_ID: '101' }),
                voxRow({
                    CRM_ACTIVITY_ID: '102',
                    CALL_START_DATE: '2026-07-21T10:00:00Z',
                }),
            ],
            activities: {
                101: activity(101),
                102: activity(102, { FILES: [] }),
            },
            busyKeys: ['test.bitrix24.ru:101'],
        });
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            userId: 7,
            limit: 5,
        } as never);
        expect(result.skippedAlreadyProcessed).toBe(1);
        expect(result.skippedNoAudio).toBe(1);
        expect(pipeline.execute).not.toHaveBeenCalled();
    });

    it('подбор по dealId: чужая сделка отфильтровывается по владельцу', async () => {
        const { useCase, pipeline } = makeDeps({
            voxRows: [
                voxRow({ CRM_ACTIVITY_ID: '101' }),
                voxRow({
                    CRM_ACTIVITY_ID: '102',
                    CALL_START_DATE: '2026-07-21T10:00:00Z',
                }),
            ],
            activities: {
                101: activity(101, { OWNER_ID: '999' }),
                102: activity(102),
            },
        });
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            dealId: 555,
            limit: 5,
        } as never);
        expect(pipeline.execute).toHaveBeenCalledTimes(1);
        expect(pipeline.execute).toHaveBeenCalledWith(
            expect.objectContaining({ activityId: 102, dealId: 555 }),
        );
        expect(result.results).toHaveLength(1);
    });

    it('ошибка пайплайна одного звонка не прерывает батч', async () => {
        const { useCase } = makeDeps({ pipelineError: true });
        const result = await useCase.execute({
            domain: 'test.bitrix24.ru',
            userId: 7,
            limit: 1,
        } as never);
        expect(result.results[0]).toEqual(
            expect.objectContaining({
                status: 'error',
                error: 'pipeline down',
            }),
        );
    });
});
