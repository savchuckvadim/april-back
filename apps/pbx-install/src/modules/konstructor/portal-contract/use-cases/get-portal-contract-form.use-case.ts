import { Injectable, NotFoundException } from '@nestjs/common';
import { portal_contracts } from 'generated/prisma';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    PortalContractFormData,
    PortalContractFormService,
    PortalContractService,
} from '@lib/portal-lib/konstructor';

/**
 * Получение initial-данных формы создания `portal_contract` и списка договоров
 * портала по `domain`. Резолв портала — через {@link PortalStoreService},
 * доменная логика — в konstructor.
 */
@Injectable()
export class GetPortalContractFormUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly formService: PortalContractFormService,
        private readonly portalContractService: PortalContractService,
    ) {}

    async getFormByDomain(domain: string): Promise<PortalContractFormData> {
        const portalId = await this.resolvePortalId(domain);
        return this.formService.getForm(portalId);
    }

    async listByDomain(domain: string): Promise<portal_contracts[]> {
        const portalId = await this.resolvePortalId(domain);
        return this.portalContractService.findByPortalId(portalId);
    }

    private async resolvePortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal with domain ${domain} not found`,
            );
        }
        return Number(portal.id);
    }
}
