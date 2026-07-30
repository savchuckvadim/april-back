import {
    BadRequestException,
    ConflictException,
    GoneException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/core/prisma';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { ShareLink } from 'generated/prisma';
import type { ShareLinkRefreshJobData } from './share-link-refresh.cron';
import {
    CreateShareLinkDto,
    EShareLinkStatus,
    SHARE_LINK_MAX_ACTIVE_PER_CREATOR,
    SHARE_LINK_MAX_REFRESHABLE_RANGE_DAYS,
    ShareLinkDto,
    ShareLinkFilterSnapshotDto,
    UpdateShareLinkDto,
} from '../dto/share-link.dto';
import {
    formatPeriodDate,
    parseSnapshotPeriod,
} from '../lib/snapshot-period.util';
import { ShareLinkSnapshotService } from './share-link-snapshot.service';
import { SharePresenceService } from './share-presence.service';

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
        private readonly presence: SharePresenceService,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    // ─────────────────────────── создание/CRUD ───────────────────────────

    async create(dto: CreateShareLinkDto): Promise<ShareLinkDto> {
        this.validateRefreshableRange(dto.isRefreshable, dto.snapshot);
        await this.validateActiveLimit(dto.domain, dto.creatorBxUserId);

        const portalId = await this.requirePortalId(dto.domain);
        // Клиентский токен (фронт уже положил URL в буфер в жесте клика)
        // либо серверный. Занятый клиентский — конфликт, не перезаписываем.
        const token = dto.token ?? randomBytes(24).toString('base64url');
        if (dto.token) {
            const busy = await this.prisma.shareLink.findUnique({
                where: { token: dto.token },
                select: { id: true },
            });
            if (busy) {
                throw new ConflictException(
                    'Токен ссылки уже занят — повторите создание',
                );
            }
        }
        const now = Date.now();
        const expiresAt = new Date(now + dto.expiresInDays * DAY_MS);

        // Статус PENDING: снимок строится АСИНХРОННО фоновой джобой —
        // создание возвращается мгновенно (генерация report+calling+
        // finance×2+airtime занимала десятки секунд и провоцировала
        // повторные клики/дубли). nextRefreshAt проставит джоба после
        // первого снимка (markGenerated).
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
                nextRefreshAt: null,
                expiresAt,
                status: EShareLinkStatus.PENDING,
            },
        });

        await this.dispatcher.dispatch<ShareLinkRefreshJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SHARE_LINK_REFRESH,
            { token } satisfies ShareLinkRefreshJobData,
            `share-refresh-${token}`,
            { removeOnComplete: true, removeOnFail: true },
        );

        this.logger.log(
            `Создана ссылка ${token} (${dto.domain}, автор ${dto.creatorBxUserId}, ` +
                `${dto.isRefreshable ? 'обновляемая' : 'статичная'}, до ${expiresAt.toISOString()}) — снимок в очереди`,
        );
        return this.toDto(link);
    }

    /** Снимок готов (после первой генерации PENDING → ACTIVE). */
    async markGenerated(link: ShareLink): Promise<ShareLink> {
        return this.prisma.shareLink.update({
            where: { id: link.id },
            data: {
                status: EShareLinkStatus.ACTIVE,
                lastRefreshedAt: new Date(),
                nextRefreshAt: link.isRefreshable
                    ? new Date(Date.now() + link.refreshIntervalSec * 1000)
                    : null,
            },
        });
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
                          // PENDING (готовится) тоже показываем владельцу
                          status: {
                              in: [
                                  EShareLinkStatus.PENDING,
                                  EShareLinkStatus.ACTIVE,
                              ],
                          },
                          expiresAt: { gt: new Date() },
                      }),
            },
            orderBy: { createdAt: 'desc' },
        });
        // Обогащаем presence-счётчиками (Redis): онлайн + уникальные.
        return Promise.all(
            links.map(async link => ({
                ...this.toDto(link),
                onlineCount: await this.presence.countOnline(link.token),
                uniqueViewCount: await this.presence.countUnique(link.token),
            })),
        );
    }

    async revoke(domain: string, token: string): Promise<ShareLinkDto> {
        const link = await this.requireOwned(domain, token);
        const updated = await this.prisma.shareLink.update({
            where: { id: link.id },
            data: { status: EShareLinkStatus.REVOKED, nextRefreshAt: null },
        });
        await this.snapshots.drop(link);
        await this.presence.drop(link.token);
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

    /**
     * Публичный доступ: активная ИЛИ готовящаяся (pending) ссылка.
     * Отозвана/протухла/error → 410. Pending — контроллер отдаст
     * «generating» без данных (снимок ещё строится).
     */
    async getPublicByToken(token: string): Promise<ShareLink> {
        const link = await this.prisma.shareLink.findUnique({
            where: { token },
        });
        if (
            !link ||
            (link.status !== EShareLinkStatus.ACTIVE &&
                link.status !== EShareLinkStatus.PENDING) ||
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
        // Снимки двух эпох (ISO / dd.MM.yyyy с эксклюзивным to) — прямой
        // Date.parse на dd.MM.yyyy давал NaN и ложный 400 на toggle.
        const period = parseSnapshotPeriod(snapshot);
        if (!period) {
            throw new BadRequestException(
                'У обновляемой ссылки должен быть корректный период фильтра',
            );
        }
        const from = Date.parse(period.fromIso);
        const to = Date.parse(period.toIsoInclusive);
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
                // PENDING (готовится) тоже занимает слот лимита
                status: {
                    in: [EShareLinkStatus.PENDING, EShareLinkStatus.ACTIVE],
                },
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
        // Человекочитаемый период с ВКЛЮЧИТЕЛЬНЫМ концом (сырой dateTo
        // снимка может быть эксклюзивным +1 день — заголовок врал на день).
        const period = parseSnapshotPeriod(dto.snapshot);
        const from = period
            ? formatPeriodDate(period.fromIso)
            : (dto.snapshot.reportFilters?.dateFrom?.slice(0, 10) ?? '');
        const to = period
            ? formatPeriodDate(period.toIsoInclusive)
            : (dto.snapshot.reportFilters?.dateTo?.slice(0, 10) ?? '');
        return `от ${dto.creatorName}: ${from} — ${to}`;
    }

    private toDto(link: ShareLink): ShareLinkDto {
        const snapshot = this.safeParseSnapshot(link);
        // Наружу — всегда каноничный ISO с включительным концом, из
        // снимка любой эпохи (фронт форматирует parseISO).
        const period = parseSnapshotPeriod(snapshot);
        return {
            id: link.id,
            token: link.token,
            domain: link.domain,
            creatorBxUserId: link.creatorBxUserId,
            creatorName: link.creatorName,
            title: link.title,
            periodFrom:
                period?.fromIso ?? snapshot?.reportFilters?.dateFrom ?? null,
            periodTo:
                period?.toIsoInclusive ??
                snapshot?.reportFilters?.dateTo ??
                null,
            isRefreshable: link.isRefreshable,
            refreshIntervalSec: link.refreshIntervalSec,
            lastRefreshedAt: link.lastRefreshedAt?.toISOString() ?? null,
            nextRefreshAt: link.nextRefreshAt?.toISOString() ?? null,
            expiresAt: link.expiresAt.toISOString(),
            status: link.status as EShareLinkStatus,
            isExpired: link.expiresAt.getTime() <= Date.now(),
            viewCount: link.viewCount,
            // presence — обогащается в list() (async); дефолт 0
            uniqueViewCount: 0,
            onlineCount: 0,
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
