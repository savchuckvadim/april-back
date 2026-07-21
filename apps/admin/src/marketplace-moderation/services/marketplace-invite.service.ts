import {
    BadRequestException,
    Injectable,
    Logger,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from '@lib/telegram';
import {
    generateInviteCode,
    hashInviteCode,
    inviteCodePrefix,
} from '@lib/marketplace-core';
import {
    InviteDto,
    InvitesQueryDto,
    IssuedInviteDto,
    IssueInviteDto,
    ReissueInviteDto,
} from '../dto/marketplace-invite.dto';
import {
    InviteWithRelations,
    MarketplaceInviteRepository,
} from '../repositories/marketplace-invite.repository';
import { MarketplaceModerationRepository } from '../repositories/marketplace-moderation.repository';
import { MarketplaceInviteMailer } from './marketplace-invite-mailer.port';

/** Срок действия кода по умолчанию, дней */
const DEFAULT_TTL_DAYS = 14;
/** Продукт по умолчанию */
const DEFAULT_PRODUCT_CODE = 'sales';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Коды подключения портала («invite») маркетплейс-приложения
 * «Менеджер Гарант»: выпуск, отзыв, перевыпуск.
 *
 * Клиент получает код письмом ДО установки приложения; погашение кода
 * происходит в pbx, когда клиент открыл установленное приложение.
 *
 * САМ КОД НЕ ХРАНИТСЯ — только sha256-хэш (общие утилиты
 * @lib/marketplace-core, чтобы выпуск в admin и погашение в pbx считали
 * хэш одинаково). Открытым текстом код отдаётся ровно один раз: в ответе
 * на выпуск/перевыпуск и в письме. Поэтому «переотправить тот же код»
 * невозможно — есть только перевыпуск.
 */
@Injectable()
export class MarketplaceInviteService {
    private readonly logger = new Logger(MarketplaceInviteService.name);

    /**
     * Глобальный дефолт «ставить продукт сразу при погашении кода».
     * MARKETPLACE_INVITE_AUTO_PROVISION='false' → при погашении клиенту
     * сначала показывается мастер вопросов; любое другое значение (и
     * отсутствие переменной) → продукт ставится сразу.
     * Используется, когда в теле запроса autoProvision не передан.
     */
    private readonly autoProvisionDefault: boolean;

    constructor(
        private readonly repository: MarketplaceInviteRepository,
        private readonly moderationRepository: MarketplaceModerationRepository,
        private readonly mailer: MarketplaceInviteMailer,
        private readonly configService: ConfigService,
        @Optional() private readonly telegramService?: TelegramService,
    ) {
        this.autoProvisionDefault =
            this.configService.get<string>(
                'MARKETPLACE_INVITE_AUTO_PROVISION',
            ) !== 'false';
    }

    /** Список выпущенных кодов (новые сверху); сам код наружу не отдаётся */
    async getInvites(query: InvitesQueryDto): Promise<InviteDto[]> {
        const invites = await this.repository.findInvites({
            status: query.status,
            email: query.email,
        });
        return invites.map(invite => this.toInviteDto(invite));
    }

    /** Выпуск нового кода: клиент, запись, письмо. Код виден один раз */
    async issue(
        dto: IssueInviteDto,
        issuedBy?: string,
    ): Promise<IssuedInviteDto> {
        const clientId = await this.resolveClientId(
            dto.email,
            dto.organization,
            dto.portalId,
        );
        const issued = await this.createAndSend({
            email: dto.email,
            organization: dto.organization,
            productCode: dto.productCode ?? DEFAULT_PRODUCT_CODE,
            autoProvision: dto.autoProvision ?? this.autoProvisionDefault,
            ttlDays: dto.ttlDays ?? DEFAULT_TTL_DAYS,
            clientId,
            issuedBy,
            note: dto.note,
        });

        await this.logInviteEvent('INVITE_ISSUED', issued.invite, issuedBy);
        return issued.dto;
    }

    /** Отзыв кода: погашенный отзывать нельзя (для него есть block портала) */
    async revoke(id: string, revokedBy?: string): Promise<InviteDto> {
        const invite = await this.requireInvite(id);
        this.assertRevocable(invite);

        const now = new Date();
        await this.repository.revokeInvite(id, now, revokedBy);
        await this.logInviteEvent('INVITE_REVOKED', invite, revokedBy);
        this.logger.log(
            `Invite revoked: ${invite.code_prefix} by=${revokedBy ?? '-'}`,
        );

        return this.toInviteDto({
            ...invite,
            status: 'revoked',
            revoked_at: now,
            revoked_by: revokedBy ?? null,
        });
    }

    /**
     * Перевыпуск: старый код отзывается, выпускается новый и уходит письмом.
     * Нужен потому, что повторно отправить тот же код невозможно — хранится
     * только его хэш.
     */
    async reissue(
        id: string,
        dto: ReissueInviteDto,
        issuedBy?: string,
    ): Promise<IssuedInviteDto> {
        const previous = await this.requireInvite(id);
        this.assertRevocable(previous);

        await this.repository.revokeInvite(id, new Date(), issuedBy);

        const email = dto.email ?? previous.email;
        const organization = previous.organization ?? undefined;
        const clientId =
            dto.email && dto.email !== previous.email
                ? await this.resolveClientId(email, organization)
                : (previous.client_id ??
                  (await this.resolveClientId(email, organization)));

        const issued = await this.createAndSend({
            email,
            organization,
            productCode: previous.product_code,
            autoProvision: previous.auto_provision,
            ttlDays: dto.ttlDays ?? DEFAULT_TTL_DAYS,
            clientId,
            issuedBy,
            note: dto.note ?? previous.note ?? undefined,
        });

        await this.logInviteEvent('INVITE_REISSUED', issued.invite, issuedBy, {
            previousInviteId: previous.id,
            previousCodePrefix: previous.code_prefix,
        });
        return issued.dto;
    }

    // ─── Внутреннее ───

    /**
     * Общий путь выпуска: генерация кода → запись (только хэш) → письмо.
     * Сбой письма не откатывает выпуск: код остаётся 'issued', админ видит
     * его в ответе и может передать клиенту вручную.
     */
    private async createAndSend(input: {
        email: string;
        organization?: string;
        productCode: string;
        autoProvision: boolean;
        ttlDays: number;
        clientId: bigint;
        issuedBy?: string;
        note?: string;
    }): Promise<{ invite: InviteWithRelations; dto: IssuedInviteDto }> {
        const code = generateInviteCode();
        const expiresAt = new Date(Date.now() + input.ttlDays * DAY_MS);

        const invite = await this.repository.createInvite({
            codeHash: hashInviteCode(code),
            codePrefix: inviteCodePrefix(code),
            clientId: input.clientId,
            email: input.email,
            organization: input.organization,
            productCode: input.productCode,
            autoProvision: input.autoProvision,
            expiresAt,
            issuedBy: input.issuedBy,
            note: input.note,
        });

        const emailSent = await this.mailer.sendInvite({
            code,
            email: input.email,
            organization: input.organization,
            expiresAt,
        });

        let sentAt: Date | undefined;
        if (emailSent) {
            sentAt = new Date();
            await this.repository.markInviteSent(invite.id, sentAt);
        } else {
            this.logger.warn(
                `Код ${invite.code_prefix} выпущен, но письмо на ${input.email} не ушло — передайте код вручную`,
            );
            // Страховка при отвале почты (решение владельца 2026-07-21):
            // полный текст для клиента — ВМЕСТЕ С КОДОМ — уходит в админский
            // Telegram, откуда его копипэйстят клиенту вручную. Заодно это
            // сигнал «почта не работает». Единственное место, где открытый
            // код покидает ответ ручки.
            await this.notifyEmailFailure(code, input.email, {
                organization: input.organization,
                expiresAt,
            });
        }

        return {
            invite,
            dto: {
                ...this.toInviteDto({
                    ...invite,
                    status: emailSent ? 'sent' : 'issued',
                    sent_at: sentAt ?? null,
                }),
                code,
                emailSent,
            },
        };
    }

    /** Клиент под получателя кода: существующий по email либо новый */
    /**
     * Организация, к которой привяжется код.
     *
     * Если код выпускается по заявке портала (передан portalId) — берём
     * организацию ЭТОГО портала. Иначе выпуск на адрес, отличный от указанного
     * в заявке, завёл бы вторую организацию, а погашение упёрлось бы в 409
     * «портал подключён к другой организации»: заявка уже проставила
     * portals.client_id (см. ai/tasks/bitrix-marketplace-client-identity.md).
     *
     * Email в этом случае — только адрес доставки письма, идентичность
     * организации им не подменяется.
     */
    private async resolveClientId(
        email: string,
        organization?: string,
        portalId?: number,
    ): Promise<bigint> {
        if (portalId !== undefined) {
            const portalClient = await this.repository.findClientByPortalId(
                BigInt(portalId),
            );
            if (portalClient) {
                return portalClient.id;
            }
            this.logger.warn(
                `Портал #${portalId} без организации — код выпускается по email ${email}`,
            );
        }

        const existing = await this.repository.findClientByEmail(email);
        if (existing) {
            return existing.id;
        }
        const created = await this.repository.createClient({
            name: organization ?? email,
            email,
        });
        return created.id;
    }

    private async requireInvite(id: string): Promise<InviteWithRelations> {
        const invite = await this.repository.findInviteById(id);
        if (!invite) {
            throw new BadRequestException(`Код подключения ${id} не найден`);
        }
        return invite;
    }

    /** Погашенный код отзывать нельзя — портал отключают операцией block */
    private assertRevocable(invite: InviteWithRelations): void {
        if (invite.status === 'redeemed') {
            throw new BadRequestException(
                'Код уже погашен: отозвать его нельзя. ' +
                    'Чтобы отключить портал, заблокируйте его (block) в разделе заявок.',
            );
        }
    }

    /**
     * Телеграм-фолбэк при сбое почты: служебная шапка + готовый текст
     * письма клиенту (с открытым кодом) для ручной пересылки.
     * Best-effort: сбой Telegram выпуск не роняет (код виден в ответе ручки).
     */
    private async notifyEmailFailure(
        code: string,
        email: string,
        details: { organization?: string; expiresAt: Date },
    ): Promise<void> {
        if (!this.telegramService) {
            return;
        }
        const validUntil = details.expiresAt.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
        const greeting = details.organization
            ? `Здравствуйте! Для организации «${details.organization}» выпущен код подключения портала Битрикс24 к сервису April.`
            : 'Здравствуйте! Для вас выпущен код подключения портала Битрикс24 к сервису April.';
        const message =
            `⚠️ Письмо с кодом подключения НЕ отправлено (сбой почты).\n` +
            `Получатель: ${email}\n` +
            `Отправьте клиенту вручную — готовый текст ниже:\n` +
            `─────────────\n` +
            `${greeting}\n\n` +
            `Ваш код подключения: ${code}\n\n` +
            `Установите приложение «Менеджер Гарант» из Битрикс24.Маркет, ` +
            `откройте его из левого меню портала и введите код на экране ` +
            `подключения. Код действует до ${validUntil}.\n\n` +
            `С уважением, команда April (april-app@mail.ru)`;
        try {
            await this.telegramService.sendMessage(message);
        } catch (error) {
            this.logger.warn(
                `Telegram-фолбэк кода не отправлен: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Журнал в bitrix_app_events. В payload НИКОГДА не попадает сам код */
    private async logInviteEvent(
        event: string,
        invite: InviteWithRelations,
        actor?: string,
        extra?: Record<string, string>,
    ): Promise<void> {
        await this.moderationRepository.logModerationEvent({
            domain: invite.portals?.domain ?? undefined,
            memberId: invite.portals?.member_id ?? undefined,
            event,
            status: 'processed',
            payload: JSON.stringify({
                inviteId: invite.id,
                codePrefix: invite.code_prefix,
                email: invite.email,
                productCode: invite.product_code,
                autoProvision: invite.auto_provision,
                by: actor,
                ...extra,
            }),
        });
    }

    private toInviteDto(invite: InviteWithRelations): InviteDto {
        const iso = (value: Date | null): string | undefined =>
            value ? value.toISOString() : undefined;
        return {
            id: invite.id,
            codePrefix: invite.code_prefix,
            email: invite.email,
            organization: invite.organization ?? undefined,
            productCode: invite.product_code,
            autoProvision: invite.auto_provision,
            status: invite.status,
            createdAt: iso(invite.created_at),
            expiresAt: iso(invite.expires_at),
            sentAt: iso(invite.sent_at),
            redeemedAt: iso(invite.redeemed_at),
            revokedAt: iso(invite.revoked_at),
            issuedBy: invite.issued_by ?? undefined,
            revokedBy: invite.revoked_by ?? undefined,
            redeemedPortalId: invite.redeemed_portal_id?.toString(),
            redeemedPortalDomain: invite.portals?.domain ?? undefined,
            note: invite.note ?? undefined,
        };
    }
}
