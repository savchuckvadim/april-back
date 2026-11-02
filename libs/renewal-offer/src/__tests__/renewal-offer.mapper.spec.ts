import type { RenewalOfferLinkRecord } from '../repositories/renewal-offer-link.prisma.repository';
import { ERenewalOfferLinkStatus } from '../lib/renewal-offer-status.util';
import {
    extrasFromJson,
    linkToDto,
    offerFromRecord,
} from '../lib/renewal-offer.mapper';

const record = (
    patch: Partial<RenewalOfferLinkRecord> = {},
): RenewalOfferLinkRecord =>
    ({
        id: '11111111-1111-1111-1111-111111111111',
        token: 'tok',
        clientName: 'ООО Ромашка',
        title: null,
        salesIncluded: true,
        salesPrice: 6500,
        aiIncluded: true,
        aiEmployees: 7,
        aiBasePrice: 7500,
        aiBaseEmployees: 3,
        aiExtraPrice: 1000,
        aiFreeDelta: 2,
        managerIncluded: true,
        managerPrice: 10000,
        devIncluded: true,
        devHours: 30,
        devHourPrice: 2000,
        adjustment: -2000,
        adjustmentLabel: 'Скидка за год вперёд',
        monthlyTotal: 29000,
        offerJson: {},
        expiresAt: null,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        createdBy: null,
        createdAt: new Date('2026-11-02T09:00:00Z'),
        updatedAt: null,
        ...patch,
    }) as RenewalOfferLinkRecord;

describe('offerFromRecord: состав берётся из колонок', () => {
    it('переносит цены и состав из строки', () => {
        const offer = offerFromRecord(record());
        expect(offer.salesPrice).toBe(6500);
        expect(offer.aiEmployees).toBe(7);
        expect(offer.managerIncluded).toBe(true);
        expect(offer.adjustment).toBe(-2000);
    });

    it('колонки важнее слепка: расхождение решается в пользу колонок', () => {
        // Слепок мог устареть после правки колонок отчётом или руками в БД.
        const offer = offerFromRecord(
            record({ offerJson: { salesPrice: 999, extras: [] } }),
        );
        expect(offer.salesPrice).toBe(6500);
    });

    it('«другие услуги» берутся из слепка — в колонках их нет', () => {
        const offer = offerFromRecord(
            record({
                offerJson: {
                    extras: [
                        { title: 'Телефония', price: 3000, period: 'month' },
                    ],
                },
            }),
        );
        expect(offer.extras).toEqual([
            { title: 'Телефония', price: 3000, period: 'month' },
        ]);
    });
});

describe('extrasFromJson: не доверяем форме слепка', () => {
    it('пустой и неожидаемый слепок даёт пустой список', () => {
        expect(extrasFromJson(null)).toEqual([]);
        expect(extrasFromJson({})).toEqual([]);
        expect(extrasFromJson('строка')).toEqual([]);
        expect(extrasFromJson({ extras: 'не массив' })).toEqual([]);
    });

    it('строки без названия отбрасываются', () => {
        expect(
            extrasFromJson({
                extras: [
                    { title: '  ', price: 100, period: 'month' },
                    { title: 'Телефония', price: 3000, period: 'month' },
                ],
            }),
        ).toEqual([{ title: 'Телефония', price: 3000, period: 'month' }]);
    });

    it('мусор вместо цены становится нулём, а не NaN', () => {
        const extras = extrasFromJson({
            extras: [{ title: 'Телефония', price: 'дорого', period: 'month' }],
        });
        expect(extras[0]?.price).toBe(0);
    });

    it('неизвестная периодичность считается месячной', () => {
        const extras = extrasFromJson({
            extras: [{ title: 'Телефония', price: 100, period: 'quarter' }],
        });
        expect(extras[0]?.period).toBe('month');
    });

    it('больше десяти строк не берём', () => {
        const extras = extrasFromJson({
            extras: Array.from({ length: 20 }, (_, i) => ({
                title: `Услуга ${i}`,
                price: 10,
                period: 'month',
            })),
        });
        expect(extras).toHaveLength(10);
    });
});

describe('linkToDto', () => {
    it('отдаёт состояние, сумму и даты строками', () => {
        const dto = linkToDto(record());
        expect(dto.status).toBe(ERenewalOfferLinkStatus.ACTIVE);
        expect(dto.monthlyTotal).toBe(29000);
        expect(dto.createdAt).toBe('2026-11-02T09:00:00.000Z');
        expect(dto.revokedAt).toBeNull();
    });

    it('отозванная ссылка видна по состоянию', () => {
        const dto = linkToDto(record({ revokedAt: new Date() }));
        expect(dto.status).toBe(ERenewalOfferLinkStatus.REVOKED);
    });

    it('истёкшая ссылка видна по состоянию', () => {
        const dto = linkToDto(
            record({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
        );
        expect(dto.status).toBe(ERenewalOfferLinkStatus.EXPIRED);
    });
});
