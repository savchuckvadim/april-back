import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import {
    InstallWithDetails,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import {
    MarketplacePlacementSyncService,
    PlacementSyncResult,
} from './marketplace-placement-sync.service';
import {
    AdminInstallDto,
    AdminInstallsQueryDto,
    RefreshPlacementsDto,
} from '../dto/marketplace-admin.dto';

/**
 * Admin-операции вендора над установками (под AdminKeyGuard).
 *
 * refreshPlacements — раскатка изменений эталона-манифеста (новые виджеты,
 * смена мест встройки) на уже установленный портал БЕЗ переустановки:
 * diff-синхронизация по сохранённому access_token установки.
 *
 * ⚠️ Ограничение до реализации рефреша токенов (план, этап 4): access_token
 * живёт ~1 час и обновляется при каждом открытии приложения на портале —
 * если портал давно не открывали, синхронизация вернёт ошибку авторизации;
 * тогда попросите клиента открыть приложение и повторите.
 */
@Injectable()
export class MarketplaceAdminService {
    private readonly logger = new Logger(MarketplaceAdminService.name);
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly placementSync: MarketplacePlacementSyncService,
    ) {}

    /**
     * Диагностика установок портала: статусы, ошибки шагов, компоненты.
     * Токены не возвращаются — только флаги наличия и срок жизни.
     */
    async getInstalls(
        query: AdminInstallsQueryDto,
    ): Promise<AdminInstallDto[]> {
        if (!query.memberId && !query.domain) {
            throw new BadRequestException('Укажите domain или memberId');
        }
        const installs = await this.repository.findInstallsWithComponents({
            memberId: query.memberId,
            domain: query.domain,
        });
        return installs.map(install => this.toAdminInstallDto(install));
    }

    private toAdminInstallDto(install: InstallWithDetails): AdminInstallDto {
        const iso = (value: Date | null): string | undefined =>
            value ? value.toISOString() : undefined;
        return {
            installId: install.id,
            appCode: install.app_code,
            domain: install.domain ?? install.portals.domain ?? undefined,
            memberId: install.portals.member_id ?? undefined,
            lang: install.lang ?? undefined,
            installStatus: install.install_status,
            errorStep: install.error_step ?? undefined,
            errorDetail: install.error_detail ?? undefined,
            installedAt: iso(install.installed_at),
            uninstalledAt: iso(install.uninstalled_at),
            updatedAt: iso(install.updated_at) ?? new Date(0).toISOString(),
            tokenExpiresAt: iso(install.expires_at),
            hasAccessToken: Boolean(install.access_token),
            hasRefreshToken: Boolean(install.refresh_token),
            hasApplicationToken: Boolean(install.application_token),
            components: install.marketplace_install_components.map(item => ({
                productCode: item.product_code,
                componentType: item.component_type,
                componentCode: item.component_code,
                status: item.status,
                reasonCode: item.reason_code ?? undefined,
                errorDetail: item.error_detail ?? undefined,
                attempts: item.attempts,
                lastAttemptAt: iso(item.last_attempt_at),
            })),
        };
    }

    async refreshPlacements(
        dto: RefreshPlacementsDto,
    ): Promise<PlacementSyncResult> {
        const install = dto.memberId
            ? await this.repository.findInstallByMemberId(
                  dto.memberId,
                  this.appCode,
              )
            : dto.domain
              ? await this.repository.findInstallByDomain(
                    dto.domain,
                    this.appCode,
                )
              : null;

        if (!install) {
            throw new NotFoundException(
                'Установка не найдена (укажите memberId или domain портала)',
            );
        }
        if (install.uninstalled_at) {
            throw new BadRequestException(
                'Приложение удалено с портала — синхронизация невозможна',
            );
        }

        const domain = install.portals.domain ?? dto.domain;
        if (!domain) {
            throw new BadRequestException('У портала не указан домен');
        }
        const accessToken = this.repository.getAccessToken(install);
        if (!accessToken) {
            throw new BadRequestException(
                'Нет сохранённого access_token — попросите клиента открыть приложение и повторите',
            );
        }

        this.logger.log(
            `Admin refresh placements: domain=${domain} install=${install.id}`,
        );
        try {
            return await this.placementSync.syncPlacements(
                domain,
                accessToken,
                install.id,
                install.portal_id,
            );
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error ? error.message : String(error),
            );
        }
    }
}
