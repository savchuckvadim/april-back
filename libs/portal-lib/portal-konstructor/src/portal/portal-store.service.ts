import { Injectable } from '@nestjs/common';
import { PortalDto, PortalEntity } from './portal.entity';
import { PortalRepository } from './portal.repository';

@Injectable()
export class PortalStoreService {
    constructor(private readonly portalRepository: PortalRepository) {}

    async create(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        return await this.portalRepository.create(portal);
    }

    async update(portal: Partial<PortalEntity>): Promise<PortalEntity | null> {
        return await this.portalRepository.update(portal);
    }

    async delete(id: number): Promise<void> {
        await this.portalRepository.delete(id);
    }
    async deleteByClientId(clientId: number): Promise<void> {
        await this.portalRepository.deleteByClientId(clientId);
    }

    async getPortal(id: number): Promise<PortalEntity | null> {
        return await this.portalRepository.findById(id);
    }

    async getPortalByDomain(domain: string): Promise<PortalEntity | null> {
        return await this.portalRepository.findByDomain(domain);
    }

    async getPortals(): Promise<PortalEntity[] | null> {
        return await this.portalRepository.findManyWithRelations();
    }
    async getPortalsByClientId(
        clientId: number,
    ): Promise<PortalEntity[] | null> {
        return await this.portalRepository.findByClientId(clientId);
    }

    async getAuthRootPortalByClientId(
        clientId: number,
    ): Promise<PortalDto | null> {
        const clientPortals = await this.getPortalsByClientId(clientId);
        const rootPortal = clientPortals?.[0];
        return rootPortal ? new PortalDto(rootPortal) : null;
    }

    async getPortalById(id: number): Promise<PortalEntity | null> {
        return this.portalRepository.findById(id);
    }

    async updateWebhook(
        domain: string,
        webhook: string,
    ): Promise<PortalEntity | null> {
        return this.portalRepository.updateWebhook(domain, webhook);
    }
}
