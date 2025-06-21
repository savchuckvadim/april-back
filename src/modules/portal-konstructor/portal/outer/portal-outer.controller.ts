import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { UpdatePortalDto } from "./dto/update-portal.dto";
import { PortalOuterService } from "./portal-outer.service";


@ApiTags('Portal Outer')
@Controller('portal-outer')
export class PortalOuterController {
    constructor(
        private readonly service: PortalOuterService,
    ) { }

    @ApiOperation({ summary: 'Get portal by domain' })
    @Get('domain/:domain')
    async getPortalByDomain(@Param('domain') domain: string): Promise<any | null> {
        return await this.service.getByDomain(domain);
    }

    @ApiOperation({ summary: 'Update portal in online server by domain' })
    @Post('update')
    async updatePortalByDomain(@Body() body: UpdatePortalDto): Promise<any | null> {
        return await this.service.setOrUpdate(body);
    }

}