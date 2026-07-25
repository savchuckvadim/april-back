import {
    BadRequestException,
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/core/prisma';
import { ShareLink } from 'generated/prisma';
import {
    CreateShareLinkDto,
    EShareLinkStatus,
    SHARE_LINK_MAX_ACTIVE_PER_CREATOR,
    SHARE_LINK_MAX_REFRESHABLE_RANGE_DAYS,
    ShareLinkDto,
    ShareLinkFilterSnapshotDto,
    UpdateShareLinkDto,
} from '../dto/share-link.dto';
import { ShareLinkSnapshotService } from './share-link-snapshot.service';

const DAY_MS = 24 * 3600 * 1000;

/**
 * Метаданные публичных ссылок на KPI-отчёт (таблица share_link).
 *
 * Токен — случайный (randomBytes 24 → base64url, неугадываемый), отзыв —
 * статус в БД + удаление снимка из кэша. Снимками данных занимается
 * ShareLinkSnapshotService.
 */
@Injectable()
export class ShareLinkService {
    private readonly logger = new Logger(ShareLinkService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly snapshots: ShareLinkSnapshotService,
    ) {}

    // ─────────────────────────── создание/CRUD ───────────────────────────

    async create(dto: CreateShareLinkDto): Promise<ShareLinkDto> {
        this.validateRefreshableRange(dto.isRefreshable, dto.snapshot);
        await this.validateActiveLimit(dto.domain, dto.creatorBxUserId);

        const portalId = await this.requirePortalId(dto.domain);
        const token = randomBytes(24).toString('base64url');
        const now = Date.now();
        const expiresAt = new Date(now + dto.expiresInDays * DAY_MS);

        const link = await this.prisma.shareLink.create({
            data: {
                id: randomUUID(),
                token,
                portalId,
                domain: dto.domain,
                creatorBxUserId: dto.creatorBxUserId,
                creatorName: dto.creatorName,
                title: dto.title?.trim() || this.defaultTitle(dto),
                filterSnapshot: JSON.stringify(dto.snapshot),
                isRefreshable: dto.isRefreshable,
                nextRefreshAt: dto.isRefreshable
                    ? new Date(now + 900 * 1000)
                    : null,
                expiresAt,
                status: EShareLinkStatus.ACTIVE,
            },
        });

        // Первый снимок — синхронно: создатель ждёт так же, как ждёт
        // обычную загрузку отчёта. Ошибка генерации = ссылка не создана.
        try {
            await this.snapshots.generate(link, dto.snapshot);
        } catch (error) {
            await this.prisma.shareLink.delete({ where: { id: link.id } });
            throw error;
        }

        this.logger.log(
            `Создана ссылка ${token} (${dto.domain}, автор ${dto.creatorBxUserId}, ` +
                `${dto.isRefreshable ? 'обновляемая' : 'статичная'}, до ${expiresAt.toISOString()})`,
        );
        return this.toDto(link);
    }

    async list(
        domain: string,
        creatorBxUserId?: number,
        includeInactive = false,
    ): Promise<ShareLinkDto[]> {
        const links = await this.prisma.shareLink.findMany({
            where: {
                domain,
                ...(creatorBxUserId !== undefined ? { creatorBxUserId } : {}),
                ...(includeInactive
                    ? {}
                    : {
                          status: EShareLinkStatus.ACTIVE,
                          expiresAt: { gt: new Date() },
                      }),
            },
            orderBy: { createdAt: 'desc' },
        });
        return links.map(link => this.toDto(link));
    }

    async revoke(domain: string, token: string): Promise<ShareLinkDto> {
        const link = await this.requireOwned(domain, token);
        const updated = await this.prisma.shareLink.update({
            where: { id: link.id },
            data: { status: EShareLinkStatus.REVOKED, nextRefreshAt: null },
        });
        await this.snapshots.drop(link);
        this.logger.log(`Отозвана ссылка ${token} (${domain})`);
        return this.toDto(updated);
    }

    /** Ручное «обновить сейчас» из интерфейса владельца. */
    async refreshNow(domain: string, token: string): Promise<ShareLinkDto> {
        const link = await this.requireOwned(domain, token);
        if (link.status !== EShareLinkStatus.ACTIVE) {
            throw new BadRequestException('Ссылка не активна');
        }
        await this.snapshots.generate(link, this.parseSnapshot(link));
        return this.toDto(await this.markRefreshed(link));
    }

    async update(dto: UpdateShareLinkDto): Promise<ShareLinkDto> {
        const link = await this.requireOwned(dto.domain, dto.token);

        if (dto.isRefreshable === true) {
            this.validateRefreshableRange(true, this.parseSnapshot(link));
        }

        const updated = await this.prisma.shareLink.update({
            where: { id: link.id },
            data: {
                ...(dto.title !== undefined ? { title: dto.title } : {}),
                ...(dto.isRefreshable !== undefined
                    ? {
                          isRefreshable: dto.isRefreshable,
                          nextRefreshAt: dto.isRefreshable
                              ? new Date(
                                    Date.now() + link.refreshIntervalSec * 1000,
                                )
                              : null,
                      }
                    : {}),
            },
        });
        return this.toDto(updated);
    }

    // ─────────────────────────── публичная сторона ───────────────────────────

    /** Активная ссылка по токену; протухла/отозвана → 410 Gone. */
    async getActiveByToken(token: string): Promise<ShareLink> {
        const link = await this.prisma.shareLink.findUnique({
            where: { token },
        });
        if (
            !link ||
            link.status !== EShareLinkStatus.ACTIVE ||
            link.expiresAt.getTime() <= Date.now()
        ) {
            throw new GoneException('Ссылка недействительна');
        }
        return link;
    }

    async registerView(id: string): Promise<void> {
        await this.prisma.shareLink.update({
            where: { id },
            data: {
                viewCount: { increment: 1 },
                lastViewedAt: new Date(),
            },
        });
    }

    // ─────────────────────────── для cron/processor ───────────────────────────

    /** Обновляемые ссылки, которым пора пересчитать снимок. */
    async findDue(limit = 20): Promise<ShareLink[]> {
        return this.prisma.shareLink.findMany({
            where: {
                isRefreshable: true,
                status: EShareLinkStatus.ACTIVE,
                nextRefreshAt: { lte: new Date() },
                expiresAt: { gt: new Date() },
            },
            orderBy: { nextRefreshAt: 'asc' },
            take: limit,
        });
    }

    async findByToken(token: string): Promise<ShareLink | null> {
        return this.prisma.shareLink.findUnique({ where: { token } });
    }

    async markRefreshed(link: ShareLink): Promise<ShareLink> {
        return this.prisma.shareLink.update({
            where: { id: link.id },
            data: {
                lastRefreshedAt: new Date(),
                nextRefreshAt: link.isRefreshable
                    ? new Date(Date.now() + link.refreshIntervalSec * 1000)
                    : null,
            },
        });
    }

    /** Транзиентная ошибка обновления — отложить следующую попытку. */
    async postponeRefresh(link: ShareLink): Promise<void> {
        await this.prisma.shareLink.update({
            where: { id: link.id },
            data: {
                nextRefreshAt: new Date(
                    Date.now() + link.refreshIntervalSec * 1000,
                ),
            },
        });
    }

    /** Фатальная ошибка (портал удалён и т.п.) — снимок остаётся до expiry. */
    async markError(link: ShareLink): Promise<void> {
        await this.prisma.shareLink.update({
            where: { id: link.id },
            data: { status: EShareLinkStatus.ERROR, nextRefreshAt: null },
        });
    }

    parseSnapshot(link: ShareLink): ShareLinkFilterSnapshotDto {
        return JSON.parse(link.filterSnapshot) as ShareLinkFilterSnapshotDto;
    }

    // ─────────────────────────── внутренности ───────────────────────────

    private validateRefreshableRange(
        isRefreshable: boolean,
        snapshot: ShareLinkFilterSnapshotDto,
    ): void {
        if (!isRefreshable) return;
        const from = Date.parse(snapshot.reportFilters?.dateFrom ?? '');
        const to = Date.parse(snapshot.reportFilters?.dateTo ?? '');
        if (Number.isNaN(from) || Number.isNaN(to)) {
            throw new BadRequestException(
                'У обновляемой ссылки должен быть корректный период фильтра',
            );
        }
        if (to - from > SHARE_LINK_MAX_REFRESHABLE_RANGE_DAYS * DAY_MS) {
            throw new BadRequestException(
                `Период обновляемой ссылки — не более ${SHARE_LINK_MAX_REFRESHABLE_RANGE_DAYS} дней`,
            );
        }
    }

    private async validateActiveLimit(
        domain: string,
        creatorBxUserId: number,
    ): Promise<void> {
        const active = await this.prisma.shareLink.count({
            where: {
                domain,
                creatorBxUserId,
                status: EShareLinkStatus.ACTIVE,
                expiresAt: { gt: new Date() },
            },
        });
        if (active >= SHARE_LINK_MAX_ACTIVE_PER_CREATOR) {
            throw new BadRequestException(
                `Не более ${SHARE_LINK_MAX_ACTIVE_PER_CREATOR} активных ссылок — отзовите неиспользуемые`,
            );
        }
    }

    private async requireOwned(
        domain: string,
        token: string,
    ): Promise<ShareLink> {
        const link = await this.prisma.shareLink.findUnique({
            where: { token },
        });
        if (!link || link.domain !== domain) {
            throw new NotFoundException('Ссылка не найдена');
        }
        return link;
    }

    private async requirePortalId(domain: string): Promise<bigint> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            select: { id: true },
        });
        if (!portal) {
            throw new NotFoundException(`Портал не найден по домену ${domain}`);
        }
        return portal.id;
    }

    private defaultTitle(dto: CreateShareLinkDto): string {
        const from = dto.snapshot.reportFilters?.dateFrom?.slice(0, 10) ?? '';
        const to = dto.snapshot.reportFilters?.dateTo?.slice(0, 10) ?? '';
        return `от ${dto.creatorName}: ${from} — ${to}`;
    }

    private toDto(link: ShareLink): ShareLinkDto {
        const snapshot = this.safeParseSnapshot(link);
        return {
            id: link.id,
            token: link.token,
            domain: link.domain,
            creatorBxUserId: link.creatorBxUserId,
            creatorName: link.creatorName,
            title: link.title,
            periodFrom: snapshot?.reportFilters?.dateFrom ?? null,
            periodTo: snapshot?.reportFilters?.dateTo ?? null,
            isRefreshable: link.isRefreshable,
            refreshIntervalSec: link.refreshIntervalSec,
            lastRefreshedAt: link.lastRefreshedAt?.toISOString() ?? null,
            nextRefreshAt: link.nextRefreshAt?.toISOString() ?? null,
            expiresAt: link.expiresAt.toISOString(),
            status: link.status as EShareLinkStatus,
            isExpired: link.expiresAt.getTime() <= Date.now(),
            viewCount: link.viewCount,
            lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
            createdAt: link.createdAt?.toISOString() ?? null,
        };
    }

    private safeParseSnapshot(
        link: ShareLink,
    ): ShareLinkFilterSnapshotDto | null {
        try {
            return this.parseSnapshot(link);
        } catch {
            this.logger.warn(`Повреждённый filter_snapshot у ${link.token}`);
            return null;
        }
    }
}
