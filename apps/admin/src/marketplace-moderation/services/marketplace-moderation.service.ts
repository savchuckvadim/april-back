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

    private async callPbxActivate(
        portal: ModerationPortal,
        approvedBy?: string,
    ): Promise<PbxActivationResponse> {
        if (!this.pbxAdminKey) {
            throw new BadGatewayException(
                'MARKETPLACE_ADMIN_KEY не задан в env admin — вызов pbx-активации невозможен',
            );
        }
        const url = `${this.pbxApiUrl}/api/bitrix-marketplace/admin/products/activate`;
        try {
            const response = await firstValueFrom(
                this.http.post<PbxActivationResponse>(
                    url,
                    {
                        memberId: portal.member_id ?? undefined,
                        domain: portal.domain ?? undefined,
                        productCode: 'sales',
                        approvedBy,
                    },
                    {
                        headers: { 'X-Admin-Key': this.pbxAdminKey },
                        timeout: 20_000,
                    },
                ),
            );
            // ResponseInterceptor pbx может оборачивать ответ в {data: ...}
            const body = response.data as PbxActivationResponse & {
                data?: PbxActivationResponse;
            };
            return body.data ?? body;
        } catch (error) {
            const detail = this.extractHttpErrorDetail(error);
            await this.repository.logModerationEvent({
                memberId: portal.member_id ?? undefined,
                domain: portal.domain ?? undefined,
                event: 'MODERATION_APPROVE',
                status: 'error',
                errorDetail: detail,
            });
            throw new BadGatewayException(
                `Активация в pbx не удалась: ${detail}`,
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
