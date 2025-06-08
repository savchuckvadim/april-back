import { Controller, Get, Param } from "@nestjs/common";
import { ProviderService } from "./provider.service";
import { ApiTags } from "@nestjs/swagger";
import { ProviderEntityWithRq, RqEntity } from "./provider.entity";

@ApiTags('Portal Konstructor')
@Controller('provider')
export class ProviderController {
    constructor(
        private readonly service: ProviderService,
    ) { }

    @Get(':id')
    async getProvider(@Param('id') id: number): Promise<RqEntity | null> {
        return await this.service.findById(id);
    }

    @Get('domain/:domain')
    async getProviderByDomain(@Param('domain') domain: string): Promise<ProviderEntityWithRq[] | null> {
        return await this.service.findByDomain(domain);
    }

}