import { Injectable, NotFoundException } from '@nestjs/common';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { MarketplaceComponentStateRepository } from '@lib/marketplace-core';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { computePortalSessionState } from './marketplace-session.service';
import { CabinetSummaryDto } from '../dto/marketplace-cabinet.dto';

/**
 * Сводка кабинета: состояние допуска + продукты портала + статусы
 * компонентов установки. Один запрос фронта на экран active
 * («Мои продукты» и «Статус установки» вместо статики).
 */
@Injectable()
export class MarketplaceCabinetService {
    private readonly appCode = BITRIX_APP_CODES.GARANT as string;

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly componentState: MarketplaceComponentStateRepository,
    ) {}

    async getSummary(memberId: string): Promise<CabinetSummaryDto> {
        const install = await this.repository.findInstallWithClient(
            memberId,
            this.appCode,
        );
        if (!install || install.uninstalled_at) {
            throw new NotFoundException('Установка приложения не найдена');
        }
        const portal = install.portals;

        const [products, components] = await Promise.all([
            this.repository.findPortalProducts(portal.id),
            this.componentState.findComponents({ installId: install.id }),
        ]);

        return {
            state: computePortalSessionState(
                portal.approval_status,
                portal.client_id,
            ),
            ...(portal.clients
                ? {
                      organization: {
                          name: portal.clients.name,
                          email: portal.clients.email ?? undefined,
                      },
                  }
                : {}),
            products: products.map(product => ({
                code: product.product_code,
                status: product.status,
                activatedAt: product.activated_at?.toISOString(),
            })),
            components: components.map(component => ({
                productCode: component.product_code,
                componentType: component.component_type,
                componentCode: component.component_code,
                status: component.status,
                reasonCode: component.reason_code ?? undefined,
            })),
            installStatus: install.install_status,
        };
    }
}
