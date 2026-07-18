import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { TelegramService } from '@lib/telegram';
import {
    ApplicationDto,
    ApplicationsQueryDto,
    ApprovalAction,
    ApprovalActionDto,
    ApprovalResultDto,
    InstallComponentDto,
} from '../dto/marketplace-moderation.dto';
import {
    AdminMarketplaceInstallDetailsDto,
    AdminMarketplaceInstallDto,
    AppEventsPageDto,
    EventsQueryDto,
    InstallsQueryDto,
    PbxActionResultDto,
    PortalProductDto,
} from '../dto/marketplace-admin-views.dto';
import {
    InstallWithPortal,
    MarketplaceModerationRepository,
    ModerationPortal,
} from '../repositories/marketplace-moderation.repository';

/** Ответ pbx-ручки активации продукта (см. ActivationResultDto в pbx) */
interface PbxActivationResponse {
    provisionDispatched?: boolean;
    provisionJobId?: string;
}

/**
 * Модерация подключений маркетплейса (этап 3 онбординга):
 *
 * approve — клиент → active, затем HTTP-вызов pbx
 *   POST /api/bitrix-marketplace/admin/products/activate (X-Admin-Key):
 *   pbx выставляет допуск approved, активирует продукт sales и ставит
 *   фоновую задачу provisioning pbx-сущностей. Маркетплейс-мир (очередь,
 *   репозитории) живёт в pbx — admin его не дублирует.
 *
 * block — локально: портал blocked + клиент disabled.
 *
 * Все действия журналируются в bitrix_app_events; уведомление вендору в
 * Telegram — best-effort (TelegramService опционален).
 */
@Injectable()
export class MarketplaceModerationService {
    private readonly logger = new Logger(MarketplaceModerationService.name);

    /** База pbx API (внутренняя или публичная) */
    private readonly pbxApiUrl: string;
    /** Ключ admin-ручек pbx (X-Admin-Key) */
    private readonly pbxAdminKey?: string;

    constructor(
        private readonly repository: MarketplaceModerationRepository,
        private readonly http: HttpService,
        private readonly configService: ConfigService,
        @Optional() private readonly telegramService?: TelegramService,
    ) {
        this.pbxApiUrl =
            this.configService.get<string>('PBX_API_URL') ??
            'https://api.pbx.april-app.ru';
        this.pbxAdminKey = this.configService.get<string>(
            'MARKETPLACE_ADMIN_KEY',
        );
    }

    /** Список заявок на подключение (порталы source='marketplace') */
    async getApplications(
        query: ApplicationsQueryDto,
    ): Promise<ApplicationDto[]> {
        const portals = await this.repository.findApplications({
            approvalStatus: query.approvalStatus,
        });
        return portals.map(portal => this.toApplicationDto(portal));
    }

    /** approve/block заявки; approvedBy — login супер-пользователя из JWT */
    async decide(
        portalId: number,
        dto: ApprovalActionDto,
        approvedBy?: string,
    ): Promise<ApprovalResultDto> {
        const portal = await this.repository.findPortalById(BigInt(portalId));
        if (!portal) {
            throw new NotFoundException(`Портал #${portalId} не найден`);
        }
        if (portal.source !== 'marketplace') {
            throw new BadRequestException(
                `Портал #${portalId} не является маркетплейс-порталом`,
            );
        }

        return dto.action === ApprovalAction.APPROVE
            ? this.approve(portal, dto, approvedBy)
            : this.block(portal, dto, approvedBy);
    }

    /** Статусы компонентов установки портала (прогресс provisioning) */
    async getComponents(portalId: number): Promise<InstallComponentDto[]> {
        const portal = await this.repository.findPortalById(BigInt(portalId));
        if (!portal) {
            throw new NotFoundException(`Портал #${portalId} не найден`);
        }
        const components = await this.repository.findComponentsByPortal(
            BigInt(portalId),
        );
        return components.map(item => ({
            productCode: item.product_code,
            componentType: item.component_type,
            componentCode: item.component_code,
            status: item.status,
            reasonCode: item.reason_code ?? undefined,
            errorDetail: item.error_detail ?? undefined,
            attempts: item.attempts,
        }));
    }

    private async approve(
        portal: ModerationPortal,
        dto: ApprovalActionDto,
        approvedBy?: string,
    ): Promise<ApprovalResultDto> {
        if (!portal.member_id && !portal.domain) {
            throw new BadRequestException(
                'У портала нет ни member_id, ни domain — активация невозможна',
            );
        }

        if (portal.clients) {
            await this.repository.updateClientStatus(
                portal.clients.id,
                'active',
            );
        }

        // Активация продукта sales в pbx: допуск + portal_products +
        // фоновый provisioning pbx-сущностей.
        const activation = await this.callPbxActivate(portal, approvedBy);

        await this.repository.logModerationEvent({
            memberId: portal.member_id ?? undefined,
            domain: portal.domain ?? undefined,
            event: 'MODERATION_APPROVE',
            status: 'processed',
            payload: JSON.stringify({
                approvedBy,
                comment: dto.comment,
                provisionJobId: activation.provisionJobId,
            }),
        });
        await this.notifyVendor(
            `✅ Подключение одобрено: ${portal.clients?.name ?? '-'} ` +
                `(${portal.domain ?? portal.member_id ?? '-'}), ` +
                `модератор: ${approvedBy ?? '-'}. Установка sales запущена.`,
        );
        this.logger.log(
            `Approve: portal=${portal.id} by=${approvedBy ?? '-'} job=${activation.provisionJobId ?? '-'}`,
        );

        return {
            portalId: portal.id.toString(),
            action: ApprovalAction.APPROVE,
            approvalStatus: 'approved',
            clientStatus: portal.clients ? 'active' : undefined,
            provisionDispatched: activation.provisionDispatched ?? false,
            provisionJobId: activation.provisionJobId,
        };
    }

    private async block(
        portal: ModerationPortal,
        dto: ApprovalActionDto,
        approvedBy?: string,
    ): Promise<ApprovalResultDto> {
        await this.repository.setPortalBlocked(portal.id);
        if (portal.clients) {
            await this.repository.updateClientStatus(
                portal.clients.id,
                'disabled',
            );
        }
        await this.repository.logModerationEvent({
            memberId: portal.member_id ?? undefined,
            domain: portal.domain ?? undefined,
            event: 'MODERATION_BLOCK',
            status: 'processed',
            payload: JSON.stringify({ by: approvedBy, comment: dto.comment }),
        });
        this.logger.log(`Block: portal=${portal.id} by=${approvedBy ?? '-'}`);

        return {
            portalId: portal.id.toString(),
            action: ApprovalAction.BLOCK,
            approvalStatus: 'blocked',
            clientStatus: portal.clients ? 'disabled' : undefined,
            provisionDispatched: false,
        };
    }

    // ─── Обзорные разделы (read-only, напрямую из общей Prisma-схемы) ───

    /** Все установки маркетплейс-приложения с фильтрами */
    async getInstalls(
        query: InstallsQueryDto,
    ): Promise<AdminMarketplaceInstallDto[]> {
        const installs = await this.repository.findInstalls({
            domain: query.domain,
            memberId: query.memberId,
            installStatus: query.installStatus,
        });
        return installs.map(install => this.toInstallDto(install));
    }

    /** Деталь установки с компонентами */
    async getInstall(
        installId: string,
    ): Promise<AdminMarketplaceInstallDetailsDto> {
        const install = await this.repository.findInstallById(installId);
        if (!install) {
            throw new NotFoundException(`Установка ${installId} не найдена`);
        }
        return {
            ...this.toInstallDto({
                ...install,
                _count: {
                    marketplace_install_components:
                        install.marketplace_install_components.length,
                },
            }),
            components: install.marketplace_install_components.map(item => ({
                productCode: item.product_code,
                componentType: item.component_type,
                componentCode: item.component_code,
                status: item.status,
                reasonCode: item.reason_code ?? undefined,
                errorDetail: item.error_detail ?? undefined,
                attempts: item.attempts,
            })),
        };
    }

    /** Журнал bitrix_app_events (новые сверху, take ≤ 100) */
    async getEvents(query: EventsQueryDto): Promise<AppEventsPageDto> {
        const { items, total } = await this.repository.findEvents({
            memberId: query.memberId,
            domain: query.domain,
            event: query.event,
            status: query.status,
            take: query.take ?? 50,
            skip: query.skip ?? 0,
        });
        const iso = (value: Date | null): string | undefined =>
            value ? value.toISOString() : undefined;
        return {
            total,
            items: items.map(item => ({
                id: item.id,
                memberId: item.member_id ?? undefined,
                domain: item.domain ?? undefined,
                event: item.event,
                status: item.status,
                payload: item.payload ?? undefined,
                errorDetail: item.error_detail ?? undefined,
                createdAt: iso(item.created_at),
            })),
        };
    }

    /** Продукты портала (portal_products) */
    async getPortalProducts(portalId: number): Promise<PortalProductDto[]> {
        const portal = await this.repository.findPortalById(BigInt(portalId));
        if (!portal) {
            throw new NotFoundException(`Портал #${portalId} не найден`);
        }
        const products = await this.repository.findPortalProducts(
            BigInt(portalId),
        );
        const iso = (value: Date | null): string | undefined =>
            value ? value.toISOString() : undefined;
        return products.map(product => ({
            code: product.product_code,
            status: product.status,
            activatedAt: iso(product.activated_at),
            paidUntil: iso(product.paid_until),
        }));
    }

    // ─── Действия через pbx (X-Admin-Key фронту не отдаём) ───

    /** Повторный запуск provisioning pbx-сущностей портала */
    async provisionRefresh(portalId: number): Promise<PbxActionResultDto> {
        const portal = await this.requireMarketplacePortal(portalId);
        const body = await this.callPbx(
            '/api/bitrix-marketplace/admin/provision/refresh',
            {
                memberId: portal.member_id ?? undefined,
                domain: portal.domain ?? undefined,
                productCode: 'sales',
            },
            portal,
            'MODERATION_PROVISION_REFRESH',
        );
        return { ok: true, details: JSON.stringify(body) };
    }

    /** Синхронизация привязок виджетов портала с эталоном-манифестом */
    async placementsRefresh(portalId: number): Promise<PbxActionResultDto> {
        const portal = await this.requireMarketplacePortal(portalId);
        const body = await this.callPbx(
            '/api/bitrix-marketplace/admin/placements/refresh',
            {
                memberId: portal.member_id ?? undefined,
                domain: portal.domain ?? undefined,
            },
            portal,
            'MODERATION_PLACEMENTS_REFRESH',
        );
        return { ok: true, details: JSON.stringify(body) };
    }

    private async requireMarketplacePortal(
        portalId: number,
    ): Promise<ModerationPortal> {
        const portal = await this.repository.findPortalById(BigInt(portalId));
        if (!portal) {
            throw new NotFoundException(`Портал #${portalId} не найден`);
        }
        if (portal.source !== 'marketplace') {
            throw new BadRequestException(
                `Портал #${portalId} не является маркетплейс-порталом`,
            );
        }
        return portal;
    }

    private toInstallDto(
        install: InstallWithPortal,
    ): AdminMarketplaceInstallDto {
        const iso = (value: Date | null): string | undefined =>
            value ? value.toISOString() : undefined;
        return {
            installId: install.id,
            portalId: install.portal_id.toString(),
            domain: install.domain ?? install.portals.domain ?? undefined,
            memberId: install.portals.member_id ?? undefined,
            approvalStatus: install.portals.approval_status ?? undefined,
            appCode: install.app_code,
            installStatus: install.install_status,
            errorStep: install.error_step ?? undefined,
            errorDetail: install.error_detail ?? undefined,
            version: install.version ?? undefined,
            installedAt: iso(install.installed_at),
            uninstalledAt: iso(install.uninstalled_at),
            tokenExpiresAt: iso(install.expires_at),
            hasRefreshToken: Boolean(install.refresh_token),
            componentsCount: install._count.marketplace_install_components,
        };
    }

    private async callPbxActivate(
        portal: ModerationPortal,
        approvedBy?: string,
    ): Promise<PbxActivationResponse> {
        return (await this.callPbx(
            '/api/bitrix-marketplace/admin/products/activate',
            {
                memberId: portal.member_id ?? undefined,
                domain: portal.domain ?? undefined,
                productCode: 'sales',
                approvedBy,
            },
            portal,
            'MODERATION_APPROVE',
        )) as PbxActivationResponse;
    }

    /**
     * Общий вызов admin-ручек pbx (X-Admin-Key из env; ключ живёт только
     * server-side). Ошибка → журнал события + BadGateway с деталями.
     */
    private async callPbx(
        path: string,
        payload: Record<string, unknown>,
        portal: ModerationPortal,
        journalEvent: string,
    ): Promise<unknown> {
        if (!this.pbxAdminKey) {
            throw new BadGatewayException(
                'MARKETPLACE_ADMIN_KEY не задан в env admin — вызов pbx невозможен',
            );
        }
        try {
            const response = await firstValueFrom(
                this.http.post<unknown>(`${this.pbxApiUrl}${path}`, payload, {
                    headers: { 'X-Admin-Key': this.pbxAdminKey },
                    timeout: 20_000,
                }),
            );
            // ResponseInterceptor pbx может оборачивать ответ в {data: ...}
            const body = response.data as { data?: unknown } | undefined;
            return body && typeof body === 'object' && 'data' in body
                ? (body.data ?? body)
                : body;
        } catch (error) {
            const detail = this.extractHttpErrorDetail(error);
            await this.repository.logModerationEvent({
                memberId: portal.member_id ?? undefined,
                domain: portal.domain ?? undefined,
                event: journalEvent,
                status: 'error',
                errorDetail: detail,
            });
            throw new BadGatewayException(
                `Вызов pbx (${path}) не удался: ${detail}`,
            );
        }
    }

    private extractHttpErrorDetail(error: unknown): string {
        if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error
        ) {
            const response = (
                error as { response?: { data?: { message?: unknown } } }
            ).response;
            const message = response?.data?.message;
            if (Array.isArray(message)) {
                return message.map(item => String(item)).join('; ');
            }
            if (typeof message === 'string') {
                return message;
            }
            if (message !== undefined && message !== null) {
                return JSON.stringify(message);
            }
        }
        return error instanceof Error ? error.message : String(error);
    }

    private async notifyVendor(message: string): Promise<void> {
        if (!this.telegramService) {
            return;
        }
        try {
            await this.telegramService.sendMessage(message);
        } catch (error) {
            this.logger.warn(
                `Telegram-уведомление не отправлено: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    private toApplicationDto(portal: ModerationPortal): ApplicationDto {
        const install = portal.marketplace_installs
            .slice()
            .sort(
                (a, b) =>
                    (b.updated_at?.getTime() ?? 0) -
                    (a.updated_at?.getTime() ?? 0),
            )[0];
        const iso = (value: Date | null | undefined): string | undefined =>
            value ? value.toISOString() : undefined;
        return {
            portalId: portal.id.toString(),
            domain: portal.domain ?? undefined,
            memberId: portal.member_id ?? undefined,
            approvalStatus: portal.approval_status ?? undefined,
            organizationName: portal.clients?.name ?? undefined,
            contactEmail: portal.clients?.email ?? undefined,
            clientStatus: portal.clients?.status ?? undefined,
            installStatus: install?.install_status,
            uninstalledAt: iso(install?.uninstalled_at),
            tokenExpiresAt: iso(install?.expires_at),
            hasRefreshToken: Boolean(install?.refresh_token),
            approvedAt: iso(portal.approved_at),
            approvedBy: portal.approved_by ?? undefined,
        };
    }
}
