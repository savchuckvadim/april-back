import { CallReportBaseItemService } from '../services/call-report-base-item.service';
import { CallReportSmartWriterService } from '../services/call-report-smart-writer.service';

jest.mock('../services/call-report-smart-writer.service');

const MockedWriter = CallReportSmartWriterService as jest.MockedClass<
    typeof CallReportSmartWriterService
>;

const ROW = {
    id: '42',
    domain: 'alfacentr.bitrix24.ru',
    activityId: '101',
    callId: 'ext_1',
    callStartedAt: new Date('2026-09-08T10:00:00Z'),
    text: 'текст',
    durationSec: '700',
    entityType: 'deal',
    entityId: '900',
    userId: '222',
};

interface Options {
    /** PORTAL_USER_ID телефонии; null — телефония владельца не дала. */
    userId?: string | null;
    /** ASSIGNED_BY_ID сделки-владельца — намеренно ЧУЖОЙ сотрудник. */
    assignedById?: string;
    /** Раскладка связей: ownerCategoryCode задаёт «своя ли воронка». */
    family?: Record<string, unknown>;
}

const makeDeps = (options?: Options) => {
    const row = {
        ...ROW,
        userId: options?.userId === undefined ? ROW.userId : options.userId,
    };
    const transcriptionStore = {
        findPipelineById: jest.fn().mockResolvedValue(row),
    };
    const smartResolver = {
        resolve: jest.fn().mockResolvedValue({
            entityTypeId: 1040,
            typeId: 128,
            ufKeyByCode: {},
            enumItems: {},
        }),
    };
    const bitrix = {
        api: {
            call: jest.fn().mockResolvedValue({
                result: {
                    COMPANY_ID: '232232',
                    CONTACT_ID: '44',
                    ASSIGNED_BY_ID: options?.assignedById ?? '317',
                },
            }),
        },
        activity: {
            getAllFresh: jest
                .fn()
                .mockResolvedValue({ activities: [{ ID: '101' }] }),
            addBinding: jest.fn().mockResolvedValue({}),
        },
    };
    const pbxService = { init: jest.fn().mockResolvedValue({ bitrix }) };
    const aiService = {
        findByTranscriptionIds: jest.fn().mockResolvedValue([]),
    };
    const dealFamily = {
        resolve: jest.fn().mockResolvedValue(
            options?.family ?? {
                mainDealId: 232,
                mainConfidence: 'likely',
            },
        ),
    };
    const addItem = jest.fn().mockResolvedValue(580);
    MockedWriter.mockImplementation(() => ({ addItem }) as never);

    const service = new CallReportBaseItemService(
        pbxService as never,
        smartResolver as never,
        transcriptionStore as never,
        aiService as never,
        dealFamily as never,
    );
    return { service, addItem, dealFamily };
};

/**
 * Каркас элемента — ПЕРВЫЙ писатель карточки (создаёт её до глубокого
 * разбора). Прод-баг 08.09.2026 (alfacentr) жил здесь ровно так же, как в
 * intake: связи от владельца звонка любой воронки, ответственный из чужой
 * сделки.
 */
describe('CallReportBaseItemService — связи и ответственный каркаса', () => {
    afterEach(() => jest.clearAllMocks());

    it('ответственный — владелец звонка из телефонии, а не ответственный сделки', async () => {
        const { service, addItem } = makeDeps();

        await service.createBaseItem('42', 'call');

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: 222 }),
        );
    });

    it('владельца звонка нет, сделка ЧУЖОЙ воронки — ответственный не подставляется', async () => {
        const { service, addItem } = makeDeps({ userId: null, family: {} });

        await service.createBaseItem('42', 'call');

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: undefined }),
        );
    });

    it('владельца звонка нет, сделка СВОЕЙ воронки — берём её ответственного', async () => {
        const { service, addItem } = makeDeps({
            userId: null,
            family: { mainDealId: 900, ownerCategoryCode: 'sales_base' },
        });

        await service.createBaseItem('42', 'call');

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ managerId: 317 }),
        );
    });

    it('в раскладку связей передаётся клиент звонка — вход для дотяжки', async () => {
        const { service, dealFamily } = makeDeps();

        await service.createBaseItem('42', 'call');

        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'alfacentr.bitrix24.ru',
            900,
            expect.objectContaining({ companyId: 232232, contactId: 44 }),
        );
    });

    /**
     * Решение владельца 08.09.2026: родитель элемента — только сделка
     * воронки «ОП Основная». Сделка-владелец звонка (900, чужая воронка) в
     * writer не передаётся вовсе — родителя из неё поставить нельзя.
     */
    it('сделка-владелец звонка в writer не уходит: родителя ставит раскладка', async () => {
        const { service, addItem } = makeDeps();

        await service.createBaseItem('42', 'call');

        const input = (addItem.mock.calls[0] as [Record<string, unknown>])[0];
        expect(input).not.toHaveProperty('dealId');
        expect(input.mainDealId).toBe(232);
    });

    it('владелец чужой воронки и дотяжки нет — связи со сделкой нет, разбор не падает', async () => {
        const { service, addItem } = makeDeps({ family: {} });

        const itemId = await service.createBaseItem('42', 'call');

        expect(itemId).toBe(580);
        const input = (addItem.mock.calls[0] as [Record<string, unknown>])[0];
        expect(input).not.toHaveProperty('dealId');
        expect(input.mainDealId).toBeUndefined();
    });

    it('«основная сделка» берётся из раскладки, а не от владельца звонка', async () => {
        const { service, addItem } = makeDeps();

        await service.createBaseItem('42', 'call');

        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({ mainDealId: 232 }),
        );
    });

    it('раскладка пуста — связь «основной сделки» тоже пуста, элемент создаётся', async () => {
        const { service, addItem } = makeDeps({ family: { unresolved: true } });

        const itemId = await service.createBaseItem('42', 'call');

        expect(itemId).toBe(580);
        expect(addItem).toHaveBeenCalledWith(
            expect.objectContaining({
                mainDealId: undefined,
                presentationDealId: undefined,
                xoDealId: undefined,
            }),
        );
    });

    it('звонок по лиду: сделку-владельца в раскладку не отдаём, ищем по клиенту', async () => {
        const { service, dealFamily } = makeDeps();
        MockedWriter.mockImplementation(
            () => ({ addItem: jest.fn().mockResolvedValue(580) }) as never,
        );
        const leadService = service as unknown as {
            transcriptionStore: { findPipelineById: jest.Mock };
        };
        leadService.transcriptionStore.findPipelineById.mockResolvedValue({
            ...ROW,
            entityType: 'lead',
        });

        await service.createBaseItem('42', 'call');

        expect(dealFamily.resolve).toHaveBeenCalledWith(
            'alfacentr.bitrix24.ru',
            undefined,
            expect.objectContaining({ companyId: 232232 }),
        );
    });
});
