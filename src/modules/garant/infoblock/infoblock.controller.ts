import { Controller, Get, Param } from "@nestjs/common";
import { InfoblockService } from "./infoblock.service";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags('Garant')
@Controller('infoblock')
export class InfoblockController {
    constructor(private readonly infoblockService: InfoblockService) { }

    @ApiOperation({ summary: 'Get all infoblocks' })
    @Get('all')
    async getInfoblocks() {
        return this.infoblockService.getInfoblocks();
    }


    @ApiOperation({ summary: 'Get infoblock by code' })
    @Get(':code')
    async getInfoblockByCode(@Param('code') code: string) {
        return this.infoblockService.getInfoblockByCode(code);
    }
}
