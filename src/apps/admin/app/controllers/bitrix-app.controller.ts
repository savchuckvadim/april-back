import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitrixAppService } from '@/modules/bitrix-setup/app/services/bitrix-app.service';
import { CreateBitrixAppDto, UpdateBitrixAppDto, GetBitrixAppDto, BitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { toBitrixAppDto } from '@/modules/bitrix-setup/app/lib/bx-app-dto.mapper';
import { EnabledAppDto } from '@/modules/bitrix-setup/app/dto/enaled-app.dto';


@ApiTags('Admin Bitrix App Management')
@Controller('admin/bitrix-apps')
export class AdminBitrixAppController {
    constructor(private readonly bitrixAppService: BitrixAppService) { }

    @ApiOperation({ summary: 'Create or update a Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app created or updated successfully',
        type: BitrixAppDto,
    })
  
    @Post('store-or-update')
    async storeOrUpdateApp(@Body() dto: CreateBitrixAppDto): Promise<BitrixAppDto> {
        const result = await this.bitrixAppService.storeOrUpdateApp(dto);
        return result.app;
    }

    @ApiOperation({ summary: 'Get Bitrix app by domain and code' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app found',
        type: BitrixAppDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Get('get')
    async getApp(@Query() dto: GetBitrixAppDto): Promise<BitrixAppDto> {
        const app = await this.bitrixAppService.getApp(dto);
        return toBitrixAppDto(app);
    }

    @ApiOperation({ summary: 'Get all Bitrix apps' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',
        type: [BitrixAppDto],
    })
    @Get()
    async getAllApps(): Promise<BitrixAppDto[]> {
        const apps = await this.bitrixAppService.getAllApps();
        return apps.map(app => toBitrixAppDto(app));
    }

    @ApiOperation({ summary: 'Get Bitrix apps by portal domain' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',
        type: [BitrixAppDto],
    })
    @Get('portal/:domain')
    async getAppsByPortal(@Param('domain') domain: string): Promise<BitrixAppDto[]> {
        const apps = await this.bitrixAppService.getAppsByPortal(domain);
        return apps.map(app => toBitrixAppDto(app));
    }

    @ApiOperation({ summary: 'Get Bitrix apps by portal ID' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',   
        type: [BitrixAppDto],
    })
    @Get('portal-id/:portalId')
    async getAppsByPortalId(@Param('portalId', ParseIntPipe) portalId: number): Promise<BitrixAppDto[]> {
        const apps = await this.bitrixAppService.getAppsByPortalId(portalId);
        return apps.map(app => toBitrixAppDto(app));
    }

    @ApiOperation({ summary: 'Get enabled Bitrix apps' })
    @ApiResponse({
        status: 200,
        description: 'Enabled Bitrix apps found',
        type: [EnabledAppDto],
    })
    @Get('enabled')
    async getEnabledApps(): Promise<EnabledAppDto[]> {
        const apps = await this.bitrixAppService.getEnabledApps();
        return apps;
    }

    @ApiOperation({ summary: 'Update Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app updated successfully', 
        type: BitrixAppDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Put(':id')
    async updateApp(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateBitrixAppDto,
    ): Promise<BitrixAppDto> {
        const app = await this.bitrixAppService.updateApp(id, dto);
        return toBitrixAppDto(app);
    }

    @ApiOperation({ summary: 'Delete Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app deleted successfully',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Delete(':id')
    async deleteApp(@Param('id') id: string): Promise<boolean> {
        const result = await this.bitrixAppService.deleteApp(BigInt(id));
        return result;
    }
}

