import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { TemplateBaseService } from "./template-base.service";
import { TemplateBaseEntity, TemplateBasePortalEntity } from "./template-base.entity";


@ApiTags('Portal Konstructor')
@Controller('template-base')
export class TemplateBaseController {
    constructor(
        private readonly service: TemplateBaseService,
    ) { }

    @Get('offer/:domain')
    async getOfferTemplateByDomain(@Param('domain') domain: string): Promise<TemplateBasePortalEntity[] | null> {
        return await this.service.getOfferTemplateByDomain(domain);
    }
    @Get('templates/:domain')
    async getTemplatesByDomain(@Param('domain') domain: string): Promise<TemplateBasePortalEntity[] | null> {
        return await this.service.getTemplatesByDomain(domain);
    }
    @Get('templates')
    async getTemplates(): Promise<TemplateBaseEntity[] | null> {
        return await this.service.getTemplates();
    }
}