import { Controller, Get, Param, Query } from "@nestjs/common";
import { TestSmartService } from "./services/test-smart.service";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags('Alfa Smart')
@Controller('alfa-smart')
export class AlfaSmartController {
    constructor(
        private readonly testSmartService: TestSmartService
    ) { }

    @ApiOperation({ summary: 'Get smarts' })
    @Get('get-smarts')
    async getSmarts(@Query('domain') domain: string) {
        return await this.testSmartService.getSmarts(domain);
    }

    @ApiOperation({ summary: 'Get smart fields by id' })
    @Get('get-smart/:id')
    async getSmartFieldsById(@Param('id') id: string, @Query('domain') domain: string) {
        return await this.testSmartService.getSmartFieldsById(id, domain);
    }

    @ApiOperation({ summary: 'Get smart categories' })
    @Get('get-smart-categories/:entityTypeId')
    async getSmartCategories(@Param('entityTypeId') entityTypeId: string, @Query('domain') domain: string) {
        return await this.testSmartService.getSmartCategories(domain, entityTypeId);
    }

    @ApiOperation({ summary: 'Get smart data by id' })
    @Get('get-smart-data/:entityTypeId')
    async getSmartDataById(@Param('entityTypeId') entityTypeId: string, @Query('domain') domain: string) {
        return await this.testSmartService.getSmartDataById(domain, entityTypeId);
    }

    @ApiOperation({ summary: 'Get all smarts' })
    @Get('get-all-smarts')
    async getAllSmarts(@Query('domain') domain: string) {
        return await this.testSmartService.getAllSmarts(domain);
    }
}