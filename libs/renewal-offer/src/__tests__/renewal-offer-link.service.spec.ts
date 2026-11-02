import { GoneException, NotFoundException } from '@nestjs/common';
import { RenewalOfferLinkService } from '../services/renewal-offer-link.service';
import type {
    CreateRenewalOfferLinkData,
    RenewalOfferLinkPrismaRepository,
    RenewalOfferLinkRecord,
} from '../repositories/renewal-offer-link.prisma.repository';

type Repo = jest.Mocked<RenewalOfferLinkPrismaRepository>;

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
        managerIncluded: false,
        managerPrice: 10000,
        devIncluded: true,
        devHours: 30,
        devHourPrice: 2000,
        adjustment: 0,
        adjustmentLabel: 'Скидка',
        monthlyTotal: 18000,
        offerJson: { extras: [] },
        expiresAt: null,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        createdBy: null,
        createdAt: new Date('2026-11-02T09:00:00Z'),
        updatedAt: null,
        ...patch,
    }) as RenewalOfferLinkRecord;

const makeRepo = (): Repo =>
    ({
        create: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
        findByToken: jest.fn(),
        revoke: jest.fn(),
        revokeAllNotRevoked: jest.fn(),
        registerView: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Repo;

describe('RenewalOfferLinkService.create', () => {
    let repo: Repo;
    let service: RenewalOfferLinkService;

    beforeEach(() => {
        repo = makeRepo();
        repo.create.mockImplementation((data: CreateRenewalOfferLinkData) => {
            // offerJson у записи — JsonValue, у входа — InputJsonValue;
            // для подстановки в тестовую запись типы приводим явно.
            const { now, offerJson, ...rest } = data;
            return Promise.resolve(
                record({
                    ...rest,
                    offerJson: offerJson as RenewalOfferLinkRecord['offerJson'],
                    createdAt: now,
                    updatedAt: now,
                }),
            );
        });
        service = new RenewalOfferLinkService(repo);
    });

    it('выдаёт неугадываемый токен', async () => {
        await service.create({ offer: { clientName: 'ООО Ромашка' } });
        const data = repo.create.mock.calls[0]?.[0];
        // 24 байта в base64url — 32 символа.
        expect(data?.token).toHaveLength(32);
        expect(data?.token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('каждая ссылка получает свой токен', async () => {
        await service.create({ offer: { clientName: 'Первый' } });
        await service.create({ offer: { clientName: 'Второй' } });
        const first = repo.create.mock.calls[0]?.[0]?.token;
        const second = repo.create.mock.calls[1]?.[0]?.token;
        expect(first).not.toBe(second);
    });

    it('сохраняет посчитанный месячный итог', async () => {
        await service.create({
            offer: {
                clientName: 'ООО Ромашка',
                salesPrice: 6500,
                aiEmployees: 7,
                managerIncluded: true,
                adjustment: -2000,
            },
        });
        // 6500 + 11500 + 10000 − 2000
        expect(repo.create.mock.calls[0]?.[0]?.monthlyTotal).toBe(26_000);
    });

    it('не указанная цена берётся из прайса', async () => {
        await service.create({ offer: { clientName: 'ООО Ромашка' } });
        const data = repo.create.mock.calls[0]?.[0];
        expect(data?.salesPrice).toBe(5000);
        expect(data?.aiBasePrice).toBe(7500);
    });

    it('без срока ссылка действует до отзыва', async () => {
        await service.create({ offer: { clientName: 'ООО Ромашка' } });
        expect(repo.create.mock.calls[0]?.[0]?.expiresAt).toBeNull();
    });

    it('срок в днях превращается в дату', async () => {
        await service.create({
            offer: { clientName: 'ООО Ромашка' },
            expiresInDays: 30,
        });
        const data = repo.create.mock.calls[0]?.[0];
        const days =
            (data.expiresAt!.getTime() - data.now.getTime()) / 86_400_000;
        expect(Math.round(days)).toBe(30);
    });

    it('пустая служебная пометка пишется как NULL, а не пустая строка', async () => {
        await service.create({
            offer: { clientName: 'ООО Ромашка' },
            title: '   ',
        });
        expect(repo.create.mock.calls[0]?.[0]?.title).toBeNull();
    });
});

describe('RenewalOfferLinkService.getPublicOffer', () => {
    let repo: Repo;
    let service: RenewalOfferLinkService;

    beforeEach(() => {
        repo = makeRepo();
        service = new RenewalOfferLinkService(repo);
    });

    it('действующая ссылка отдаёт предложение', async () => {
        repo.findByToken.mockResolvedValue(record());
        const offer = await service.getPublicOffer('tok');
        expect(offer.clientName).toBe('ООО Ромашка');
        expect(offer.salesPrice).toBe(6500);
    });

    it('неизвестный токен — 410, а не 404', async () => {
        // 404 выдал бы перебором, какие токены существуют.
        repo.findByToken.mockResolvedValue(null);
        await expect(service.getPublicOffer('нет')).rejects.toBeInstanceOf(
            GoneException,
        );
    });

    it('отозванная ссылка — 410', async () => {
        repo.findByToken.mockResolvedValue(record({ revokedAt: new Date() }));
        await expect(service.getPublicOffer('tok')).rejects.toBeInstanceOf(
            GoneException,
        );
    });

    it('истёкшая ссылка — 410', async () => {
        repo.findByToken.mockResolvedValue(
            record({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
        );
        await expect(service.getPublicOffer('tok')).rejects.toBeInstanceOf(
            GoneException,
        );
    });

    it('открытие считается просмотром', async () => {
        repo.findByToken.mockResolvedValue(record());
        await service.getPublicOffer('tok');
        expect(repo.registerView.mock.calls).toEqual([
            ['11111111-1111-1111-1111-111111111111', expect.any(Date)],
        ]);
    });

    it('сбой счётчика просмотров не ломает выдачу предложения клиенту', async () => {
        repo.findByToken.mockResolvedValue(record());
        repo.registerView.mockRejectedValue(new Error('БД недоступна'));
        await expect(service.getPublicOffer('tok')).resolves.toMatchObject({
            clientName: 'ООО Ромашка',
        });
    });

    it('служебных полей в публичном ответе нет', async () => {
        repo.findByToken.mockResolvedValue(
            record({ title: 'отправлено 02.11', viewCount: 5 }),
        );
        const offer = await service.getPublicOffer('tok');
        expect(offer).not.toHaveProperty('title');
        expect(offer).not.toHaveProperty('viewCount');
        expect(offer).not.toHaveProperty('id');
        expect(offer).not.toHaveProperty('token');
    });
});

describe('RenewalOfferLinkService.revoke', () => {
    let repo: Repo;
    let service: RenewalOfferLinkService;

    beforeEach(() => {
        repo = makeRepo();
        service = new RenewalOfferLinkService(repo);
    });

    it('неизвестная ссылка — 404 (зовут из админки, перебора нет)', async () => {
        repo.findById.mockResolvedValue(null);
        await expect(service.revoke('нет')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('повторный отзыв не меняет дату первого', async () => {
        const revokedAt = new Date('2026-11-01T10:00:00Z');
        repo.findById.mockResolvedValue(record({ revokedAt }));
        const dto = await service.revoke(
            '11111111-1111-1111-1111-111111111111',
        );
        expect(repo.revoke.mock.calls).toHaveLength(0);
        expect(dto.revokedAt).toBe(revokedAt.toISOString());
    });

    it('отзыв всех возвращает число отозванных', async () => {
        repo.revokeAllNotRevoked.mockResolvedValue(3);
        await expect(service.revokeAll()).resolves.toBe(3);
    });
});
