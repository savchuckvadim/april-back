import {
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { classifyClient } from '../../../duplicate-report/lib/duplicate-classify';
import { ClassifiedClient } from '../../../duplicate-report/types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    makeClientInput,
    makeDeal,
} from '../../../duplicate-report/__tests__/fixtures/duplicate-report.fixture';
import { EnumSalesHookCode } from '../../core/constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../../core/contracts/sales-hook-job.type';
import { ClientWorkService } from '../services/client-work.service';

const mockLoad = jest.fn<
    Promise<ClassifiedClient | null>,
    [number, Date, string[]]
>();

jest.mock('../services/client-work.reader', () => ({
    ClientWorkReader: jest.fn().mockImplementation(() => ({ load: mockLoad })),
}));

const DOMAIN = 'a.bitrix24.ru';
const CLIENT = classifyClient(
    makeClientInput([makeDeal(1), makeDeal(2), makeDeal(3)]),
    CLASSIFY_OPTIONS,
);

const setup = (canManage = true) => {
    const accept = jest
        .fn()
        .mockResolvedValue({ operationId: 'op-1', status: 'queued' });
    const assertCanManageDuplicates = jest.fn(() =>
        canManage
            ? Promise.resolve()
            : Promise.reject(new ForbiddenException('нет прав')),
    );
    const service = new ClientWorkService(
        {
            init: jest.fn().mockResolvedValue({
                bitrix: { tag: 'bitrix' },
                PortalModel: {},
            }),
        } as never,
        { activeUserIds: jest.fn() } as never,
        {
            resolve: jest.fn().mockResolvedValue({ 11: 'Иван Петров' }),
        } as never,
        {
            assertCanManageDuplicates,
            canManageDuplicates: jest.fn().mockResolvedValue(canManage),
        } as never,
        { accept } as never,
        { fingerprint: jest.fn((_hook, key: string) => `fp:${key}`) } as never,
    );
    return { service, accept };
};

const JOIN = {
    domain: DOMAIN,
    initiatorUserId: 309,
    mainDealId: 1,
    dealIds: [2, 3, 2],
    operationId: 'op-1',
};

describe('ClientWorkService — «Открытые сделки по клиенту»', () => {
    beforeEach(() => {
        mockLoad.mockReset().mockResolvedValue(CLIENT);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('список: сделки клиента с именами и правом руководителя', async () => {
        const { service } = setup();

        const response = await service.load({
            domain: DOMAIN,
            dealId: 2,
            userId: 309,
        });

        expect(mockLoad).toHaveBeenCalledWith(2, expect.any(Date), []);
        expect(response.deals.map(deal => deal.id)).toEqual([1, 2, 3]);
        expect(response.deals[0].responsibleName).toBe('Иван Петров');
        expect(response.canJoin).toBe(true);
    });

    it('присоединение: одна операция join-to-main на пачку, без повторов и основной', async () => {
        const { service, accept } = setup();

        const operation = await service.join(JOIN);

        expect(operation).toEqual({ operationId: 'op-1', status: 'queued' });
        // Выбор проверяется свежим чтением клиента ОСНОВНОЙ сделки.
        expect(mockLoad).toHaveBeenCalledWith(1, expect.any(Date), []);
        const [hook, domain, source, items, options] = accept.mock.calls[0] as [
            EnumSalesHookCode,
            string,
            EnumSalesHookSource,
            { entityKey: string; data: unknown }[],
            Record<string, unknown>,
        ];
        expect(hook).toBe(EnumSalesHookCode.JOIN_TO_MAIN);
        expect(domain).toBe(DOMAIN);
        expect(source).toBe(EnumSalesHookSource.FRAME);
        expect(items.map(item => item.entityKey)).toEqual(['deal:2', 'deal:3']);
        expect(items[0].data).toEqual({
            dealId: 2,
            targetType: 'deal',
            targetId: 1,
            closeAsDuplicate: true,
        });
        expect(options).toMatchObject({
            operationId: 'op-1',
            initiatorUserId: 309,
        });
    });

    it('не руководитель — 403, клиент не читается, операция не ставится', async () => {
        const { service, accept } = setup(false);

        await expect(service.join(JOIN)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(mockLoad).not.toHaveBeenCalled();
        expect(accept).not.toHaveBeenCalled();
    });

    it('выбор устарел (сделка уже закрыта) — 400 с номером, операция не ставится', async () => {
        const { service, accept } = setup();

        await expect(
            service.join({ ...JOIN, dealIds: [2, 500] }),
        ).rejects.toThrow(
            new BadRequestException(
                'Сделки 500 уже закрыты или не относятся к этому клиенту — ' +
                    'обновите список.',
            ),
        );
        expect(accept).not.toHaveBeenCalled();
    });
});
