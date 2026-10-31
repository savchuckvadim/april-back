import { GoneException, NotFoundException } from '@nestjs/common';
import { EPublicLinkStatus } from '../lib/public-link-status.util';
import type {
    CreatePublicLinkData,
    PublicLinkPrismaRepository,
    PublicLinkWithDomain,
} from '../repositories/public-link.prisma.repository';
import { PublicLinkService } from '../services/public-link.service';

const makeLink = (
    overrides: Partial<PublicLinkWithDomain> = {},
): PublicLinkWithDomain => ({
    id: 'link-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    token: 'token-1',
    portalId: 12n,
    title: 'Новые сотрудники',
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
    portal: { domain: 'april-garant.bitrix24.ru' },
    ...overrides,
});

const makeRepository = (link: PublicLinkWithDomain | null = makeLink()) => {
    const repository = {
        portalExists: jest.fn().mockResolvedValue(true),
        create: jest.fn((data: CreatePublicLinkData) =>
            Promise.resolve(
                makeLink({
                    id: data.id,
                    token: data.token,
                    title: data.title,
                    expiresAt: data.expiresAt,
                }),
            ),
        ),
        findAll: jest.fn().mockResolvedValue(link ? [link] : []),
        findById: jest.fn().mockResolvedValue(link),
        findByToken: jest.fn().mockResolvedValue(link),
        revoke: jest.fn((_id: string, now: Date) =>
            Promise.resolve(makeLink({ ...link, revokedAt: now })),
        ),
        revokeAllNotRevoked: jest.fn().mockResolvedValue(3),
        registerView: jest.fn().mockResolvedValue(undefined),
    };
    return repository;
};

const makeService = (repository: ReturnType<typeof makeRepository>) =>
    new PublicLinkService(repository as unknown as PublicLinkPrismaRepository);

describe('PublicLinkService', () => {
    describe('create', () => {
        it('выдаёт неугадываемый токен и обрезает название', async () => {
            const repository = makeRepository();
            const dto = await makeService(repository).create({
                portalId: 12,
                title: '  Новые сотрудники  ',
            });

            expect(dto.token.length).toBeGreaterThanOrEqual(32);
            expect(dto.title).toBe('Новые сотрудники');
            expect(dto.status).toBe(EPublicLinkStatus.ACTIVE);
        });

        it('без срока ссылка действует до отзыва', async () => {
            const repository = makeRepository();
            const dto = await makeService(repository).create({
                portalId: 12,
                title: 'Бессрочная',
            });

            expect(dto.expiresAt).toBeNull();
        });

        it('срок в днях превращается в дату окончания', async () => {
            const repository = makeRepository();
            const before = Date.now();
            const dto = await makeService(repository).create({
                portalId: 12,
                title: 'На неделю',
                expiresInDays: 7,
            });

            const expiresAt = Date.parse(dto.expiresAt ?? '');
            expect(expiresAt).toBeGreaterThanOrEqual(
                before + 7 * 24 * 3600 * 1000,
            );
        });

        it('неизвестный портал — 404, ссылка не создаётся', async () => {
            const repository = makeRepository();
            repository.portalExists.mockResolvedValue(false);

            await expect(
                makeService(repository).create({ portalId: 99, title: 'x' }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(repository.create).not.toHaveBeenCalled();
        });
    });

    describe('requireActive', () => {
        it('действующая ссылка отдаёт домен портала сервисам бэка', async () => {
            const service = makeService(makeRepository());

            await expect(service.requireActive('token-1')).resolves.toEqual({
                id: 'link-1',
                expiresAt: null,
                domain: 'april-garant.bitrix24.ru',
            });
        });

        it.each([
            ['неизвестная', null],
            ['отозванная', makeLink({ revokedAt: new Date('2026-10-02') })],
            ['истёкшая', makeLink({ expiresAt: new Date('2020-01-01') })],
            ['портал без домена', makeLink({ portal: { domain: null } })],
        ])('%s ссылка — 410', async (_name, link) => {
            const service = makeService(makeRepository(link));

            await expect(
                service.requireActive('token-1'),
            ).rejects.toBeInstanceOf(GoneException);
        });
    });

    describe('revoke', () => {
        it('неизвестная ссылка — 404', async () => {
            const service = makeService(makeRepository(null));

            await expect(service.revoke('nope')).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it('повторный отзыв не переписывает дату первого', async () => {
            const firstRevoke = new Date('2026-10-02T10:00:00Z');
            const repository = makeRepository(
                makeLink({ revokedAt: firstRevoke }),
            );

            const dto = await makeService(repository).revoke('link-1');

            expect(repository.revoke).not.toHaveBeenCalled();
            expect(dto.revokedAt).toBe(firstRevoke.toISOString());
            expect(dto.status).toBe(EPublicLinkStatus.REVOKED);
        });

        it('отозвать все — возвращает число отозванных', async () => {
            const repository = makeRepository();

            await expect(makeService(repository).revokeAll()).resolves.toBe(3);
        });
    });

    it('список показывает домен портала только в админской форме', async () => {
        const [dto] = await makeService(makeRepository()).list();

        expect(dto.domain).toBe('april-garant.bitrix24.ru');
        expect(dto.portalId).toBe(12);
    });
});
