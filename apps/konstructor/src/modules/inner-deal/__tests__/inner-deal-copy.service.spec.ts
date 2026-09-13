import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealService } from '../services/inner-deal.service';
import { InnerDealRepository } from '../repositories/inner-deal.repository';

/**
 * Копирование слепка между сделками: ручное восстановление (HTTP) и робот
 * перезаключения ходят одним и тем же путём.
 */
describe('InnerDealService.copySnapshot', () => {
    const sourceRow = {
        id: 10n,
        dealId: 159701,
        serviceSmartId: 887,
        portalId: 5n,
        domain: 'gsr.bitrix24.ru',
        currentComplect: '{"type":"prof"}',
        rows: '{"sets":{}}',
        iskraConfig: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-02'),
    } as unknown as BxDocumentDeal;

    const makeMocks = () => ({
        findSnapshot: jest.fn().mockResolvedValue(null),
        findByDomainAndDealId: jest.fn().mockResolvedValue(null),
        findByServiceSmartId: jest.fn().mockResolvedValue(null),
        findPortalIdByDomain: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(sourceRow),
        update: jest.fn().mockResolvedValue(sourceRow),
    });

    const makeService = (mocks: ReturnType<typeof makeMocks>) =>
        new InnerDealService(mocks as unknown as InnerDealRepository);

    const fromDeal = {
        kind: 'deal',
        dealId: 159701,
        serviceSmartId: null,
    } as const;

    it('нет источника — copied:false и ничего не пишем', async () => {
        const mocks = makeMocks();

        const result = await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: fromDeal,
            targetDealId: 182895,
        });

        expect(result).toEqual({
            copied: false,
            reason: 'source_not_found',
            deal: null,
        });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('у цели уже есть слепок и нет force — отказ без записи', async () => {
        const mocks = makeMocks();
        mocks.findSnapshot
            .mockResolvedValueOnce(sourceRow)
            .mockResolvedValueOnce({ ...sourceRow, id: 20n, dealId: 182895 });

        const result = await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: fromDeal,
            targetDealId: 182895,
        });

        expect(result.copied).toBe(false);
        expect(result.reason).toBe('target_exists');
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('у цели есть слепок и есть force — перезаписываем существующую строку', async () => {
        const mocks = makeMocks();
        mocks.findSnapshot
            .mockResolvedValueOnce(sourceRow)
            .mockResolvedValueOnce({ ...sourceRow, id: 20n, dealId: 182895 });

        const result = await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: fromDeal,
            targetDealId: 182895,
            force: true,
        });

        expect(result.copied).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
        const [id, data] = mocks.update.mock.calls[0] as [
            bigint,
            Partial<BxDocumentDeal>,
        ];
        expect(id).toBe(20n);
        expect(data.dealId).toBe(182895);
        expect(data.serviceSmartId).toBeNull();
    });

    it('пустая цель — создаём строку с portalId источника, без его id и дат', async () => {
        const mocks = makeMocks();
        mocks.findSnapshot
            .mockResolvedValueOnce(sourceRow)
            .mockResolvedValueOnce(null);

        const result = await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: fromDeal,
            targetDealId: 182895,
        });

        expect(result.copied).toBe(true);
        const [data] = mocks.create.mock.calls[0] as [Record<string, unknown>];
        expect(data.dealId).toBe(182895);
        expect(data.serviceSmartId).toBeNull();
        expect(data.portalId).toBe(5n);
        expect(data.currentComplect).toBe('{"type":"prof"}');
        expect(data.id).toBeUndefined();
        expect(data.created_at).toBeUndefined();
        expect(data.updated_at).toBeUndefined();
        expect(mocks.findPortalIdByDomain).not.toHaveBeenCalled();
    });

    it('источник-смарт ищется по домену и берётся самый свежий', async () => {
        const mocks = makeMocks();
        mocks.findByServiceSmartId.mockResolvedValue(sourceRow);

        await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: { kind: 'serviceSmart', serviceSmartId: 887 },
            targetDealId: 182895,
            force: true,
        });

        expect(mocks.findByServiceSmartId).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            887,
            'newest',
        );
    });

    it('portalId источника пуст — берём по домену', async () => {
        const mocks = makeMocks();
        mocks.findSnapshot
            .mockResolvedValueOnce({ ...sourceRow, portalId: null })
            .mockResolvedValueOnce(null);
        mocks.findPortalIdByDomain.mockResolvedValue(7n);

        await makeService(mocks).copySnapshot({
            domain: 'gsr.bitrix24.ru',
            source: fromDeal,
            targetDealId: 182895,
        });

        const [data] = mocks.create.mock.calls[0] as [Record<string, unknown>];
        expect(data.portalId).toBe(7n);
    });
});
