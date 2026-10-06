import { createInMemoryRedis } from '@/core/redis/testing/in-memory-redis';
import { AppCacheService } from '@lib/app-cache';
import { PBXService } from '@lib/pbx';
import { DuplicateSearchService } from '../duplicate-search.service';
import { DuplicateScoreService } from '../duplicate-score.service';
import { DuplicateSignalExtractService } from '../duplicate-signal-extract.service';
import { SignalFieldMapService } from '../signal-field-map.service';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    ExtractedSignals,
} from '../../type/duplicate.type';

/**
 * Сигналы сущности — 2–3 пачки запросов к Битриксу. Повторный поиск по
 * тому же клиенту в течение пяти минут берёт их из кэша; «проверить ещё
 * раз» (force) — обходит кэш.
 */
const NO_SIGNALS: ExtractedSignals = {
    phones: [],
    emails: [],
    inns: [],
    titles: [],
    origins: [],
    excluded: [],
    warnings: [],
};

const makeService = () => {
    const memory = createInMemoryRedis();
    const extract = jest.fn().mockResolvedValue(NO_SIGNALS);
    const service = new DuplicateSearchService(
        {} as PBXService,
        {} as AppCacheService,
        {} as SignalFieldMapService,
        { extract } as unknown as DuplicateSignalExtractService,
        {} as DuplicateScoreService,
        memory.redis,
    );
    return { service, extract, memory };
};

const input = {
    entityType: DuplicateEntityType.COMPANY,
    entityId: 431,
    level: DuplicateSearchLevel.FAST,
};

describe('DuplicateSearchService: кэш сигналов', () => {
    it('повторный поиск по тому же клиенту не обходит связи заново', async () => {
        const { service, extract, memory } = makeService();

        await service.search('a.bitrix24.ru', input);
        await service.search('a.bitrix24.ru', input);

        expect(extract).toHaveBeenCalledTimes(1);
        expect([...memory.ttlByKey.values()]).toEqual([300]);
    });

    it('«проверить ещё раз» обходит кэш и обновляет его', async () => {
        const { service, extract } = makeService();

        await service.search('a.bitrix24.ru', input);
        await service.search('a.bitrix24.ru', { ...input, force: true });

        expect(extract).toHaveBeenCalledTimes(2);
    });

    it('другой клиент или другая глубина — свои записи', async () => {
        const { service, extract } = makeService();

        await service.search('a.bitrix24.ru', input);
        await service.search('a.bitrix24.ru', { ...input, entityId: 432 });
        await service.search('a.bitrix24.ru', {
            ...input,
            level: DuplicateSearchLevel.DEEP,
        });

        expect(extract).toHaveBeenCalledTimes(3);
    });

    it('обход не удался — в кэш ничего не легло', async () => {
        const { service, extract, memory } = makeService();
        extract.mockRejectedValueOnce(new Error('Битрикс сейчас не ответил'));

        await expect(service.search('a.bitrix24.ru', input)).rejects.toThrow(
            'Битрикс сейчас не ответил',
        );
        expect(memory.store.size).toBe(0);
    });
});
