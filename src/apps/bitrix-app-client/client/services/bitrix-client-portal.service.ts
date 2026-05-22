import { Injectable } from '@nestjs/common';

import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { GetClientPortalsRequestDto } from '../dto/get-client-portals.dto';

@Injectable()
export class BitrixClientPortalService {
    constructor(private readonly portalService: PortalStoreService) {}

    async getClientPortals(
        dto: GetClientPortalsRequestDto,
    ): Promise<{ id: number; domain: string }[] | null> {
        const portals = await this.portalService.getPortalsByClientId(
            dto.clientId,
        );
        return (
            portals?.map(portal => ({
                id: Number(portal.id),
                domain: portal.domain!,
            })) || null
        );
    }
}
