import {
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { CreatePublicLinkDto, PublicLinkDto } from '../dto/public-link.dto';
import {
    EPublicLinkStatus,
    publicLinkStatus,
} from '../lib/public-link-status.util';
import {
    PublicLinkPrismaRepository,
    type PublicLinkWithDomain,
} from '../repositories/public-link.prisma.repository';

const DAY_MS = 24 * 3600 * 1000;

/** Действующая ссылка с доменом её портала: доменом пользуются только сервисы бэка. */
export interface ActivePublicLink {
    id: string;
    expiresAt: Date | null;
    domain: string;
}

/**
 * Жизненный цикл публичных ссылок: выдача и отзыв из админки, проверка токена
 * для публичных ручек. Отозванная, истёкшая и неизвестная ссылки неразличимы
 * снаружи: все дают 410.
 */
@Injectable()
export class PublicLinkService {
    private readonly logger = new Logger(PublicLinkService.name);

    constructor(private readonly repository: PublicLinkPrismaRepository) {}

    async create(dto: CreatePublicLinkDto): Promise<PublicLinkDto> {
        const portalId = BigInt(dto.portalId);
        if (!(await this.repository.portalExists(portalId))) {
            throw new NotFoundException(`Портал ${dto.portalId} не найден`);
        }
        const now = new Date();
        const link = await this.repository.create({
            id: randomUUID(),
            token: randomBytes(24).toString('base64url'),
            portalId,
            title: dto.title.trim(),
            expiresAt: dto.expiresInDays
                ? new Date(now.getTime() + dto.expiresInDays * DAY_MS)
                : null,
            now,
        });
        this.logger.log(`Создана публичная ссылка ${link.id}`);
        return this.toDto(link);
    }

    async list(): Promise<PublicLinkDto[]> {
        const links = await this.repository.findAll();
        return links.map(link => this.toDto(link));
    }

    /** Повторный отзыв ничего не меняет: дата первого отзыва остаётся. */
    async revoke(id: string): Promise<PublicLinkDto> {
        const link = await this.repository.findById(id);
        if (!link) throw new NotFoundException('Ссылка не найдена');
        if (link.revokedAt) return this.toDto(link);
        const revoked = await this.repository.revoke(id, new Date());
        this.logger.log(`Отозвана публичная ссылка ${id}`);
        return this.toDto(revoked);
    }

    async revokeAll(): Promise<number> {
        const revoked = await this.repository.revokeAllNotRevoked(new Date());
        this.logger.log(`Отозваны все публичные ссылки: ${revoked}`);
        return revoked;
    }

    async requireActive(token: string): Promise<ActivePublicLink> {
        const link = await this.repository.findByToken(token);
        const domain = link?.portal.domain;
        if (
            !link ||
            !domain ||
            publicLinkStatus(link) !== EPublicLinkStatus.ACTIVE
        ) {
            throw new GoneException('Ссылка недействительна');
        }
        return {
            id: link.id,
            expiresAt: link.expiresAt,
            domain,
        };
    }

    registerView(id: string): Promise<void> {
        return this.repository.registerView(id, new Date());
    }

    private toDto(link: PublicLinkWithDomain): PublicLinkDto {
        return {
            id: link.id,
            token: link.token,
            portalId: Number(link.portalId),
            domain: link.portal.domain ?? '',
            title: link.title,
            status: publicLinkStatus(link),
            expiresAt: link.expiresAt?.toISOString() ?? null,
            revokedAt: link.revokedAt?.toISOString() ?? null,
            viewCount: link.viewCount,
            lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
            createdAt: link.createdAt?.toISOString() ?? null,
        };
    }
}
