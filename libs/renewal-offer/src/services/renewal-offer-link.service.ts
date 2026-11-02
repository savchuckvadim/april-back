import {
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import type {
    CreateRenewalOfferLinkDto,
    PublicRenewalOfferDto,
    RenewalOfferLinkDto,
} from '../dto/renewal-offer-link.dto';
import {
    ERenewalOfferLinkStatus,
    renewalOfferLinkStatus,
} from '../lib/renewal-offer-status.util';
import { linkToDto, offerFromRecord } from '../lib/renewal-offer.mapper';
import { calcMonthlyTotal } from '../lib/renewal-offer.model';
import { normalizeRenewalOffer } from '../lib/renewal-offer.normalize';
import { RenewalOfferLinkPrismaRepository } from '../repositories/renewal-offer-link.prisma.repository';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Жизненный цикл персональных ссылок на КП: выдача и отзыв из админки,
 * отдача предложения публичной странице по токену.
 *
 * Цены живут в строке БД, поэтому клиент не может подменить их в адресе.
 * Отозванная, истёкшая и неизвестная ссылки снаружи неразличимы — все
 * дают 410, чтобы перебором нельзя было узнать, какие токены существуют.
 */
@Injectable()
export class RenewalOfferLinkService {
    private readonly logger = new Logger(RenewalOfferLinkService.name);

    constructor(
        private readonly repository: RenewalOfferLinkPrismaRepository,
    ) {}

    async create(
        dto: CreateRenewalOfferLinkDto,
        createdBy: string | null = null,
    ): Promise<RenewalOfferLinkDto> {
        const offer = normalizeRenewalOffer(dto.offer);
        const now = new Date();
        const title = dto.title?.trim();

        const record = await this.repository.create({
            id: randomUUID(),
            // 24 байта base64url — токен не перебирается.
            token: randomBytes(24).toString('base64url'),
            clientName: offer.clientName,
            title: title ? title : null,
            salesIncluded: offer.salesIncluded,
            salesPrice: offer.salesPrice,
            aiIncluded: offer.aiIncluded,
            aiEmployees: offer.aiEmployees,
            aiBasePrice: offer.aiBasePrice,
            aiBaseEmployees: offer.aiBaseEmployees,
            aiExtraPrice: offer.aiExtraPrice,
            aiFreeDelta: offer.aiFreeDelta,
            managerIncluded: offer.managerIncluded,
            managerPrice: offer.managerPrice,
            devIncluded: offer.devIncluded,
            devHours: offer.devHours,
            devHourPrice: offer.devHourPrice,
            adjustment: offer.adjustment,
            adjustmentLabel: offer.adjustmentLabel,
            monthlyTotal: calcMonthlyTotal(offer),
            // Слепок целиком: «другие услуги» живут только здесь.
            offerJson: { ...offer, extras: offer.extras.map(l => ({ ...l })) },
            expiresAt: dto.expiresInDays
                ? new Date(now.getTime() + dto.expiresInDays * DAY_MS)
                : null,
            createdBy,
            now,
        });

        this.logger.log(
            `Создана ссылка на КП ${record.id} для «${record.clientName}»`,
        );
        return linkToDto(record);
    }

    async list(): Promise<RenewalOfferLinkDto[]> {
        const records = await this.repository.findAll();
        return records.map(record => linkToDto(record));
    }

    /** Повторный отзыв ничего не меняет: дата первого отзыва остаётся. */
    async revoke(id: string): Promise<RenewalOfferLinkDto> {
        const record = await this.repository.findById(id);
        if (!record) throw new NotFoundException('Ссылка не найдена');
        if (record.revokedAt) return linkToDto(record);
        const revoked = await this.repository.revoke(id, new Date());
        this.logger.log(`Отозвана ссылка на КП ${id}`);
        return linkToDto(revoked);
    }

    async revokeAll(): Promise<number> {
        const revoked = await this.repository.revokeAllNotRevoked(new Date());
        this.logger.log(`Отозваны все ссылки на КП: ${revoked}`);
        return revoked;
    }

    /**
     * Предложение для публичной страницы. Просмотр считается здесь же:
     * открытие страницы и есть просмотр.
     */
    async getPublicOffer(token: string): Promise<PublicRenewalOfferDto> {
        const record = await this.repository.findByToken(token);
        if (
            !record ||
            renewalOfferLinkStatus(record) !== ERenewalOfferLinkStatus.ACTIVE
        ) {
            throw new GoneException('Ссылка недействительна');
        }

        const offer = offerFromRecord(record);
        // Счётчик не должен ломать выдачу предложения клиенту.
        this.repository.registerView(record.id, new Date()).catch(error => {
            const reason =
                error instanceof Error ? error.message : 'неизвестно';
            this.logger.warn(
                `Не удалось отметить просмотр ссылки ${record.id}: ${reason}`,
            );
        });

        return {
            ...offer,
            extras: offer.extras.map(line => ({ ...line })),
            expiresAt: record.expiresAt?.toISOString() ?? null,
        };
    }
}
