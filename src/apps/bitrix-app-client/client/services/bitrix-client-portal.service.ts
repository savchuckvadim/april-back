import { Injectable, NotFoundException } from '@nestjs/common';

import { ClientDto, ClientRegistrationRequestDto } from '../dto/client-registration.dto';
import { ClientRepository } from '../repositories/client.repository';
import { UserService } from '../../user/services/user.service';
import { Client } from 'generated/prisma';
import { BitrixClientService } from './bitrix-client.service';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { GetClientPortalsRequestDto } from '../dto/get-client-portals.dto';
import { PrismaService } from '@/core';


@Injectable()
export class BitrixClientPortalService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly repo: ClientRepository,
        private readonly clientService: BitrixClientService,
        private readonly portalService: PortalStoreService
        // private readonly userService: UserService,
    ) { }

    async getClientPortals(dto: GetClientPortalsRequestDto): Promise<{ id: number, domain: string }[] | null> {
    
        const portals = await this.portalService.getPortalsByClientId(dto.clientId);
        return portals?.map(portal => ({ id: Number(portal.id), domain: portal.domain! })) || null;
    }


}
