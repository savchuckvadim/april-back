import { SalesHookIdempotencyService } from '../services/sales-hook-idempotency.service';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';

describe('SalesHookIdempotencyService', () => {
    const makeService = () => {
        const redisSet = jest.fn().mockResolvedValue('OK');
        const redisDel = jest.fn().mockResolvedValue(1);
        const redisService = {
            getClient: () => ({ set: redisSet, del: redisDel }),
        };
        const cacheGet = jest.fn().mockResolvedValue(null);
        const cacheSet = jest.fn().mockResolvedValue({});
        const appCache = { get: cacheGet, set: cacheSet };
        const service = new SalesHookIdempotencyService(
            redisService as never,
            appCache as never,
        );
        return { service, redisSet, redisDel, cacheGet, cacheSet };
    };

    it('fingerprint детерминирован и не зависит от порядка ключей параметров', () => {
        const { service } = makeService();
        const a = service.fingerprint(
            EnumSalesHookCode.LEAD_TO_WORK,
            'lead:42',
            { taskMode: 'move', isXo: 'N' },
        );
        const b = service.fingerprint(
            EnumSalesHookCode.LEAD_TO_WORK,
            'lead:42',
            { isXo: 'N', taskMode: 'move' },
        );
        expect(a).toBe(b);
    });

    it('fingerprint различает хуки, сущности и параметры', () => {
        const { service } = makeService();
        const base = service.fingerprint(
            EnumSalesHookCode.LEAD_TO_WORK,
            'lead:42',
            { isXo: 'N' },
        );
        expect(
            service.fingerprint(EnumSalesHookCode.REJECT_BUFFER, 'lead:42', {
                isXo: 'N',
            }),
        ).not.toBe(base);
        expect(
            service.fingerprint(EnumSalesHookCode.LEAD_TO_WORK, 'lead:43', {
                isXo: 'N',
            }),
        ).not.toBe(base);
        expect(
            service.fingerprint(EnumSalesHookCode.LEAD_TO_WORK, 'lead:42', {
                isXo: 'Y',
            }),
        ).not.toBe(base);
    });

    it('замок берётся через SET NX PX и снимается через DEL', async () => {
        const { service, redisSet, redisDel } = makeService();

        const acquired = await service.acquireLock(
            'example.bitrix24.ru',
            EnumSalesHookCode.MERGE_DUPLICATES,
            'merge:COMPANY_1+COMPANY_2',
        );
        expect(acquired).toBe(true);
        expect(redisSet).toHaveBeenCalledWith(
            'sales_hook_lock:example.bitrix24.ru:merge-duplicates:merge:COMPANY_1+COMPANY_2',
            '1',
            'PX',
            expect.any(Number),
            'NX',
        );

        await service.releaseLock(
            'example.bitrix24.ru',
            EnumSalesHookCode.MERGE_DUPLICATES,
            'merge:COMPANY_1+COMPANY_2',
        );
        expect(redisDel).toHaveBeenCalled();
    });

    it('занятый замок возвращает false', async () => {
        const { service, redisSet } = makeService();
        redisSet.mockResolvedValueOnce(null);
        const acquired = await service.acquireLock(
            'example.bitrix24.ru',
            EnumSalesHookCode.LEAD_TO_WORK,
            'lead:42',
        );
        expect(acquired).toBe(false);
    });

    it('seen-маркер пишется с operationId и читается обратно', async () => {
        const { service, cacheGet, cacheSet } = makeService();
        await service.markSeen('example.bitrix24.ru', 'fp1', 'op-1');
        expect(cacheSet).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'seen:fp1',
                data: { operationId: 'op-1' },
            }),
        );

        cacheGet.mockResolvedValueOnce({ operationId: 'op-1' });
        await expect(
            service.getSeenOperationId('example.bitrix24.ru', 'fp1'),
        ).resolves.toBe('op-1');
    });
});
