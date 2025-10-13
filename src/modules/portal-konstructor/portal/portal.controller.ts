import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { PortalEntity } from './portal.entity';
import { UpdateWebhookDto } from './dtos/update-webhook.dto';

@ApiTags('Portal Konstructor')
@Controller('portal')
export class PortalController {
    constructor(private readonly service: PortalService) { }
    @ApiOperation({ summary: 'Get portal by id' })
    @Get(':id')
    async getPortal(@Param('id') id: number): Promise<PortalEntity | null> {
        return await this.service.getPortal(id);
    }
    @ApiOperation({ summary: 'Get portal by domain' })
    @Get('domain/:domain')
    async getPortalByDomain(
        @Param('domain') domain: string,
    ): Promise<PortalEntity | null> {
        return await this.service.getPortalByDomain(domain);
    }

    @ApiOperation({ summary: 'Get all portals' })
    @Get()
    async getPortals(): Promise<PortalEntity[] | null> {
        return await this.service.getPortals();
    }

    @ApiOperation({ summary: 'Update webhook by domain' })
    @Put('webhook/:domain')
    async updateWebhook(
        @Param('domain') domain: string,
        @Body() body: UpdateWebhookDto,
    ): Promise<PortalEntity | null> {
        return await this.service.updateWebhook(domain, body.webhook);
    }
}
