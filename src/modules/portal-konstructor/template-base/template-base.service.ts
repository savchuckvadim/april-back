import { Injectable } from "@nestjs/common";
import { TemplateBaseRepository } from "./template-base.repository";
import { TemplateBasePortalEntity } from "./template-base.entity";

@Injectable()
export class TemplateBaseService {
    constructor(
        private readonly repository: TemplateBaseRepository,
    ) { }

    async getOfferTemplateByDomain(domain: string): Promise<TemplateBasePortalEntity[] | null> {
        return await this.repository.findByDomain(domain);
    }
    async getTemplatesByDomain(domain: string): Promise<TemplateBasePortalEntity[] | null> {
        return await this.repository.findByDomain(domain);
    }
    async getTemplates() {
        return await this.repository.findManyWithRelations()
    }
}