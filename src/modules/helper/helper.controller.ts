import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { HelperBitrixService } from "./helper-bitrix.service";
import { BitrixMethodDto } from "./dto/bitrix-method.dto";
import { ApiOperation } from "@nestjs/swagger";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Helper')
@Controller('helper')
export class HelperController {
    constructor(
        private readonly helperBitrixService: HelperBitrixService
    ) { }

    @Post('bitrix/method')
    @ApiOperation({ summary: 'Call bitrix method' })
    async bitrixMethod(@Body() dto: BitrixMethodDto) {
        return await this.helperBitrixService.bxMethod(dto.domain, dto.method, dto.bxData);
    }
}