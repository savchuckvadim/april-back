import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeInviteCode } from '@lib/marketplace-core';
import { MarketplaceInviteService } from '../services/marketplace-invite.service';
import { MarketplaceInviteMailer } from '../services/marketplace-invite-mailer.port';
import {
    InviteWithRelations,
    MarketplaceInviteRepository,
} from '../repositories/marketplace-invite.repository';
import { MarketplaceModerationRepository } from '../repositories/marketplace-moderation.repository';

type InviteRepoMock = jest.Mocked<
    Pick<
        MarketplaceInviteRepository,
        | 'findInvites'
        | 'findInviteById'
        | 'findClientByEmail'
        | 'findClientByPortalId'
        | 'createClient'
        | 'createInvite'
        | 'markInviteSent'
        | 'revokeInvite'
    >
>;

type ModerationRepoMock = jest.Mocked<
    Pick<MarketplaceModerationRepository, 'logModerationEvent'>
>;

type MailerMock = jest.Mocked<Pick<MarketplaceInviteMailer, 'sendInvite'>>;

const inviteFixture = (
    over: Partial<InviteWithRelations> = {},
): InviteWithRelations =>
    ({
        id: 'invite-uuid',
        created_at: new Date('2026-07-20T10:00:00Z'),
        updated_at: new Date('2026-07-20T10:00:00Z'),
        code_hash: 'hash',
        code_prefix: 'GRNT-AB12',
        client_id: BigInt(5),
        email: 'director@romashka.ru',
        organization: 'ООО «Ромашка»',
        product_code: 'sales',
        auto_provision: true,
        status: 'issued',
        expires_at: new Date('2026-08-03T10:00:00Z'),
        sent_at: null,
        redeemed_at: null,
        revoked_at: null,
        redeemed_portal_id: null,
        issued_by: 'admin',
        revoked_by: null,
        note: null,
        clients: null,
        portals: null,
        ...over,
    }) as unknown as InviteWithRelations;

/** ConfigService с заданным значением MARKETPLACE_INVITE_AUTO_PROVISION */
const configWith = (autoProvision?: string): ConfigService =>
    ({
        get: jest.fn((key: string) =>
            key === 'MARKETPLACE_INVITE_AUTO_PROVISION'
                ? autoProvision
                : undefined,
        ),
    }) as unknown as ConfigService;

describe('MarketplaceInviteService (коды подключения портала)', () => {
    let service: MarketplaceInviteService;
    let repo: InviteRepoMock;
    let moderationRepo: ModerationRepoMock;
    let mailer: MailerMock;
    let telegram: { sendMessage: jest.Mock };

    /** Пересобирает сервис с другим env-дефолтом autoProvision */
    const buildService = (autoProvisionEnv?: string): void => {
        service = new MarketplaceInviteService(
            repo as unknown as MarketplaceInviteRepository,
            moderationRepo as unknown as MarketplaceModerationRepository,
            mailer as unknown as MarketplaceInviteMailer,
            configWith(autoProvisionEnv),
            telegram as never,
        );
    };

    beforeEach(() => {
        repo = {
            findInvites: jest.fn().mockResolvedValue([inviteFixture()]),
            findInviteById: jest.fn().mockResolvedValue(inviteFixture()),
            findClientByEmail: jest.fn().mockResolvedValue(null),
            findClientByPortalId: jest.fn().mockResolvedValue(null),
            createClient: jest.fn().mockResolvedValue({ id: BigInt(5) }),
            createInvite: jest
                .fn()
                .mockImplementation(
                    (input: { codePrefix: string; autoProvision: boolean }) =>
                        Promise.resolve(
                            inviteFixture({
                                code_prefix: input.codePrefix,
                                auto_provision: input.autoProvision,
                            }),
                        ),
                ),
            markInviteSent: jest.fn().mockResolvedValue(undefined),
            revokeInvite: jest.fn().mockResolvedValue(undefined),
        };
        moderationRepo = {
            logModerationEvent: jest.fn().mockResolvedValue(undefined),
        };
        mailer = { sendInvite: jest.fn().mockResolvedValue(true) };
        telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };
        buildService();
    });

    it('issue: создаёт клиента и запись, возвращает код, письмо → статус sent', async () => {
        const result = await service.issue(
            { email: 'director@romashka.ru', organization: 'ООО «Ромашка»' },
            'admin',
        );

        expect(repo.createClient).toHaveBeenCalledWith({
            name: 'ООО «Ромашка»',
            email: 'director@romashka.ru',
        });
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({
                clientId: BigInt(5),
                email: 'director@romashka.ru',
                productCode: 'sales',
                issuedBy: 'admin',
            }),
        );
        expect(mailer.sendInvite).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'director@romashka.ru' }),
        );
        expect(repo.markInviteSent).toHaveBeenCalledWith(
            'invite-uuid',
            expect.any(Date),
        );
        expect(result.code).toMatch(/^GRNT-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
        expect(result.emailSent).toBe(true);
        expect(result.status).toBe('sent');
    });

    it('issue: код совпадает с сохранённым хэшем, а сам код не сохраняется', async () => {
        const result = await service.issue({ email: 'a@b.ru' });

        const created = repo.createInvite.mock.calls[0][0];
        expect(created.codeHash).toHaveLength(64);
        expect(created.codeHash).not.toContain(
            normalizeInviteCode(result.code),
        );
        expect(created.codePrefix).toBe(result.code.slice(0, 9));
    });

    it('issue: существующий клиент по email переиспользуется', async () => {
        repo.findClientByEmail.mockResolvedValue({
            id: BigInt(42),
        } as never);

        await service.issue({ email: 'director@romashka.ru' });

        expect(repo.createClient).not.toHaveBeenCalled();
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({ clientId: BigInt(42) }),
        );
    });

    it('issue по заявке: код достаётся организации ПОРТАЛА, а email — только адрес доставки', async () => {
        // на другом адресе доставки живёт другая организация: если взять её,
        // погашение упрётся в 409 «портал подключён к другой организации»
        repo.findClientByPortalId.mockResolvedValue({
            id: BigInt(5),
        } as never);
        repo.findClientByEmail.mockResolvedValue({
            id: BigInt(99),
        } as never);

        await service.issue({
            email: 'new-address@romashka.ru',
            portalId: 7,
        });

        expect(repo.findClientByPortalId).toHaveBeenCalledWith(BigInt(7));
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({
                clientId: BigInt(5),
                email: 'new-address@romashka.ru',
            }),
        );
        expect(repo.createClient).not.toHaveBeenCalled();
    });

    it('issue: портал без организации → откат к поиску по email', async () => {
        repo.findClientByPortalId.mockResolvedValue(null);
        repo.findClientByEmail.mockResolvedValue({ id: BigInt(42) } as never);

        await service.issue({ email: 'director@romashka.ru', portalId: 7 });

        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({ clientId: BigInt(42) }),
        );
    });

    it('issue: сбой письма → статус остаётся issued, emailSent=false', async () => {
        mailer.sendInvite.mockResolvedValue(false);

        const result = await service.issue({ email: 'director@romashka.ru' });

        expect(repo.markInviteSent).not.toHaveBeenCalled();
        expect(result.emailSent).toBe(false);
        expect(result.status).toBe('issued');
        // код всё равно виден админу — передаст вручную
        expect(result.code).toMatch(/^GRNT-/);
    });

    it('сбой письма → телеграм-фолбэк: полный текст с кодом и получателем', async () => {
        mailer.sendInvite.mockResolvedValue(false);

        const result = await service.issue({
            email: 'director@romashka.ru',
            organization: 'ООО «Ромашка»',
        });

        expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
        const [[message]] = telegram.sendMessage.mock.calls as [[string]];
        // открытый код и адрес — админ копипэйстит клиенту из телеги
        expect(message).toContain(result.code);
        expect(message).toContain('director@romashka.ru');
        expect(message).toContain('ООО «Ромашка»');
        expect(message).toContain('НЕ отправлено');
    });

    it('письмо ушло → телеграм НЕ трогается (код в телегу не течёт)', async () => {
        await service.issue({ email: 'director@romashka.ru' });
        expect(telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('сбой и письма, и телеграма → выпуск всё равно успешен', async () => {
        mailer.sendInvite.mockResolvedValue(false);
        telegram.sendMessage.mockRejectedValue(new Error('tg down'));

        const result = await service.issue({ email: 'director@romashka.ru' });

        expect(result.code).toMatch(/^GRNT-/);
        expect(result.emailSent).toBe(false);
    });

    it('issue: autoProvision берётся из env-дефолта (false)', async () => {
        buildService('false');

        const result = await service.issue({ email: 'director@romashka.ru' });

        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({ autoProvision: false }),
        );
        expect(result.autoProvision).toBe(false);
    });

    it('issue: env не задан → autoProvision=true; явный false в body сильнее env', async () => {
        await service.issue({ email: 'a@b.ru' });
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({ autoProvision: true }),
        );

        buildService('false');
        await service.issue({ email: 'a@b.ru', autoProvision: true });
        expect(repo.createInvite).toHaveBeenLastCalledWith(
            expect.objectContaining({ autoProvision: true }),
        );
    });

    it('issue: журнал INVITE_ISSUED без самого кода в payload', async () => {
        const result = await service.issue(
            { email: 'director@romashka.ru' },
            'admin',
        );

        expect(moderationRepo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'INVITE_ISSUED' }),
        );
        const logged = moderationRepo.logModerationEvent.mock.calls[0][0];
        expect(logged.payload).not.toContain(result.code);
        expect(logged.payload).not.toContain(normalizeInviteCode(result.code));
    });

    it('revoke: статус revoked + журнал INVITE_REVOKED', async () => {
        const result = await service.revoke('invite-uuid', 'admin');

        expect(repo.revokeInvite).toHaveBeenCalledWith(
            'invite-uuid',
            expect.any(Date),
            'admin',
        );
        expect(moderationRepo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'INVITE_REVOKED' }),
        );
        expect(result.status).toBe('revoked');
        expect(result.revokedBy).toBe('admin');
    });

    it('revoke погашенного кода → BadRequestException, запись не меняется', async () => {
        repo.findInviteById.mockResolvedValue(
            inviteFixture({ status: 'redeemed' }),
        );

        await expect(
            service.revoke('invite-uuid', 'admin'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.revokeInvite).not.toHaveBeenCalled();
    });

    it('revoke несуществующего кода → BadRequestException', async () => {
        repo.findInviteById.mockResolvedValue(null);

        await expect(service.revoke('ghost')).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('reissue: старый код отозван, выпущен новый, письмо ушло', async () => {
        const result = await service.reissue('invite-uuid', {}, 'admin');

        expect(repo.revokeInvite).toHaveBeenCalledWith(
            'invite-uuid',
            expect.any(Date),
            'admin',
        );
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'director@romashka.ru',
                productCode: 'sales',
                clientId: BigInt(5),
            }),
        );
        expect(mailer.sendInvite).toHaveBeenCalled();
        expect(result.code).toMatch(/^GRNT-/);
        expect(result.emailSent).toBe(true);
        expect(moderationRepo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'INVITE_REISSUED' }),
        );
    });

    it('reissue на новый email: клиент разрешается заново', async () => {
        await service.reissue(
            'invite-uuid',
            { email: 'new@romashka.ru' },
            'admin',
        );

        expect(repo.findClientByEmail).toHaveBeenCalledWith('new@romashka.ru');
        expect(repo.createInvite).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'new@romashka.ru' }),
        );
    });

    it('reissue погашенного кода → BadRequestException', async () => {
        repo.findInviteById.mockResolvedValue(
            inviteFixture({ status: 'redeemed' }),
        );

        await expect(
            service.reissue('invite-uuid', {}, 'admin'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.createInvite).not.toHaveBeenCalled();
    });

    it('getInvites: маппинг карточки без кода и хэша, фильтры проброшены', async () => {
        repo.findInvites.mockResolvedValue([
            inviteFixture({
                status: 'redeemed',
                redeemed_at: new Date('2026-07-21T08:15:00Z'),
                redeemed_portal_id: BigInt(7),
                portals: { domain: 'romashka.bitrix24.ru' } as never,
            }),
        ]);

        const [dto] = await service.getInvites({ status: 'redeemed' });

        expect(repo.findInvites).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'redeemed' }),
        );
        expect(dto.codePrefix).toBe('GRNT-AB12');
        expect(dto.redeemedPortalId).toBe('7');
        expect(dto.redeemedPortalDomain).toBe('romashka.bitrix24.ru');
        expect(dto.redeemedAt).toBe('2026-07-21T08:15:00.000Z');
        expect(Object.keys(dto)).not.toContain('code');
        expect(Object.keys(dto)).not.toContain('codeHash');
    });
});
