import { CallReportAnalyticsCacheService } from '../services/call-report-analytics-cache.service';
import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

const QUERY: CallReportAnalyticsQueryDto = {
    domain: 'test.bitrix24.ru',
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-23T00:00:00.000Z',
    managerId: '7',
};

const makeService = (client: Record<string, jest.Mock>) =>
    new CallReportAnalyticsCacheService(
        { getClient: () => client } as never,
        { get: jest.fn(() => undefined) } as never,
    );

describe('CallReportAnalyticsCacheService', () => {
    it('ключ детерминирован и не зависит от useCache/saveToHistory', () => {
        const service = makeService({});
        const key1 = service.buildKey('summary', QUERY);
        const key2 = service.buildKey('summary', {
            ...QUERY,
            useCache: false,
            saveToHistory: true,
        });
        expect(key1).toBe(key2);
        expect(key1).toContain(
            'call-report:analytics:summary:test.bitrix24.ru:',
        );
    });

    it('разные фильтры дают разные ключи', () => {
        const service = makeService({});
        expect(service.buildKey('summary', QUERY)).not.toBe(
            service.buildKey('summary', { ...QUERY, callType: 'cold' }),
        );
        expect(service.buildKey('summary', QUERY)).not.toBe(
            service.buildKey('speech', QUERY),
        );
    });

    it('get/set сериализуют JSON и переживают недоступный Redis', async () => {
        const client = {
            get: jest.fn().mockResolvedValue('{"a":1}'),
            set: jest.fn().mockResolvedValue('OK'),
        };
        const service = makeService(client);
        await expect(service.get('key')).resolves.toEqual({ a: 1 });
        await service.set('key', { b: 2 });
        expect(client.set).toHaveBeenCalledWith('key', '{"b":2}', 'EX', 3600);

        const broken = makeService({
            get: jest.fn().mockRejectedValue(new Error('redis down')),
            set: jest.fn().mockRejectedValue(new Error('redis down')),
        });
        await expect(broken.get('key')).resolves.toBeNull();
        await expect(broken.set('key', {})).resolves.toBeUndefined();
    });

    it('reset удаляет ключи по шаблону через SCAN', async () => {
        const client = {
            scan: jest
                .fn()
                .mockResolvedValueOnce(['5', ['k1', 'k2']])
                .mockResolvedValueOnce(['0', ['k3']]),
            del: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        };
        const service = makeService(client);
        const result = await service.reset({
            report: 'summary',
            domain: 'test.bitrix24.ru',
        });
        expect(result).toEqual({
            removedKeys: 3,
            pattern: 'call-report:analytics:summary:test.bitrix24.ru:*',
        });
        expect(client.del).toHaveBeenCalledWith('k1', 'k2');
    });

    it('reset без фильтров — шаблон всего модуля', async () => {
        const client = {
            scan: jest.fn().mockResolvedValue(['0', []]),
            del: jest.fn(),
        };
        const service = makeService(client);
        const result = await service.reset({});
        expect(result.pattern).toBe('call-report:analytics:*:*:*');
        expect(result.removedKeys).toBe(0);
    });
});
