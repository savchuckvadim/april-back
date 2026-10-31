import type { ContractDto } from '../../../dto/contract.dto';
import type { KonstructorInitDataDto } from '../../../init/dto/response-init-data.dto';
import { FixedWindowLimiter } from '../lib/fixed-window-limiter';
import { toPublicCatalog } from '../lib/public-catalog.util';
import {
    EPublicLinkStatus,
    publicLinkStatus,
} from '../lib/public-link-status.util';

const NOW = new Date('2026-10-31T12:00:00Z');

describe('publicLinkStatus', () => {
    it('без дат — действует', () => {
        expect(
            publicLinkStatus({ revokedAt: null, expiresAt: null }, NOW),
        ).toBe(EPublicLinkStatus.ACTIVE);
    });

    it('срок ещё не вышел — действует', () => {
        expect(
            publicLinkStatus(
                { revokedAt: null, expiresAt: new Date('2026-11-01') },
                NOW,
            ),
        ).toBe(EPublicLinkStatus.ACTIVE);
    });

    it('срок вышел ровно сейчас — истекла', () => {
        expect(publicLinkStatus({ revokedAt: null, expiresAt: NOW }, NOW)).toBe(
            EPublicLinkStatus.EXPIRED,
        );
    });

    it('отзыв важнее срока', () => {
        expect(
            publicLinkStatus(
                { revokedAt: NOW, expiresAt: new Date('2020-01-01') },
                NOW,
            ),
        ).toBe(EPublicLinkStatus.REVOKED);
    });
});

describe('toPublicCatalog', () => {
    const contract = {
        id: 1,
        code: 'internet',
        itemId: 4242,
        measureCode: 796,
        measureName: 'мес.',
        portalMeasure: {
            id: 7,
            measure_id: 2,
            portal_id: 12,
            bitrixId: '796',
            name: 'мес.',
        },
    } as unknown as ContractDto;

    const init = {
        contracts: { current: [1], items: [contract] },
        measures: [
            {
                id: 2,
                code: 'month',
                name: 'мес.',
                bitrixId: '796',
                portalMeasureId: 7,
            },
        ],
        prices: [{ id: 1, value: 100 }],
    } as unknown as KonstructorInitDataDto;

    it('обнуляет идентификаторы Битрикса и портала', () => {
        const [item] = toPublicCatalog(init).contracts.items;

        expect(item.itemId).toBe(0);
        expect(item.measureCode).toBe(0);
        expect(item.portalMeasure.bitrixId).toBe('');
        expect(item.portalMeasure.portal_id).toBe(0);

        const [measure] = toPublicCatalog(init).measures;
        expect(measure.bitrixId).toBeNull();
        expect(measure.portalMeasureId).toBeNull();
    });

    it('оставляет то, что нужно расчёту и подписям', () => {
        const catalog = toPublicCatalog(init);

        expect(catalog.prices).toEqual(init.prices);
        expect(catalog.contracts.items[0].measureName).toBe('мес.');
        expect(catalog.measures[0].name).toBe('мес.');
    });

    it('не трогает исходный объект: он лежит в кэше init', () => {
        toPublicCatalog(init);

        expect(init.contracts.items[0].itemId).toBe(4242);
    });
});

describe('FixedWindowLimiter', () => {
    it('пропускает до лимита и режет следующий запрос', () => {
        const limiter = new FixedWindowLimiter(2, 1000);

        expect(limiter.consume('a', 0)).toBe(true);
        expect(limiter.consume('a', 1)).toBe(true);
        expect(limiter.consume('a', 2)).toBe(false);
    });

    it('считает ключи раздельно', () => {
        const limiter = new FixedWindowLimiter(1, 1000);

        expect(limiter.consume('a', 0)).toBe(true);
        expect(limiter.consume('b', 0)).toBe(true);
    });

    it('новое окно снова открывает лимит', () => {
        const limiter = new FixedWindowLimiter(1, 1000);

        expect(limiter.consume('a', 0)).toBe(true);
        expect(limiter.consume('a', 999)).toBe(false);
        expect(limiter.consume('a', 1000)).toBe(true);
    });
});
