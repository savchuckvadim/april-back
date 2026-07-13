import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import {
    MarketplacePlacementSyncService,
    PlacementSyncResult,
} from './marketplace-placement-sync.service';
import { RefreshPlacementsDto } from '../dto/marketplace-admin.dto';

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
