import { Injectable } from "@nestjs/common";
import { PortalEntity } from "./portal.entity";
import { PortalRepository } from "./portal.repository";

@Injectable()
export class PortalService {
    constructor(
        private readonly portalRepository: PortalRepository,
    ) { }

    async getPortal(id: number): Promise<PortalEntity | null> {
        return await this.portalRepository.findById(id);
    }

    async getPortalByDomain(domain: string): Promise<PortalEntity | null> {
        return await this.portalRepository.findByDomain(domain);
    }

    async getPortals(): Promise<PortalEntity[] | null> {
        return await this.portalRepository.findManyWithRelations();
    }

    async getPortalById(id: number): Promise<PortalEntity | null> {
        return this.portalRepository.findById(id);
    }

    async updateWebhook(domain: string, webhook: string): Promise<PortalEntity | null> {
        return this.portalRepository.updateWebhook(domain, webhook);
    }
}