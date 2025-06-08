import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PortalService } from "./portal.service";
import { PortalEntity } from "./portal.entity";


@ApiTags('Portal Konstructor')
@Controller('portal')
export class PortalController {
    constructor(
        private readonly service: PortalService,
    ) { }

    @Get(':id')
    async getPortal(@Param('id') id: number): Promise<PortalEntity | null> {
        return await this.service.getPortal(id);
    }
    @Get('domain/:domain')
    async getPortalByDomain(@Param('domain') domain: string): Promise<PortalEntity | null> {
        return await this.service.getPortalByDomain(domain);
    }
    @Get()
    async getPortals(): Promise<PortalEntity[] | null> {
        return await this.service.getPortals();
    }
 
}