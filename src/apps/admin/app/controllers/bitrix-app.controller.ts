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
import { CreateBitrixAppDto, UpdateBitrixAppDto, GetBitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Bitrix App Management')
@Controller('admin/bitrix-apps')
export class AdminBitrixAppController {
    constructor(private readonly bitrixAppService: BitrixAppService) { }

    @ApiOperation({ summary: 'Create or update a Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app created or updated successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'Bad request',
    })
    @Post('store-or-update')
    async storeOrUpdateApp(@Body() dto: CreateBitrixAppDto): Promise<SuccessResponseDto> {
        const result = await this.bitrixAppService.storeOrUpdateApp(dto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: result,
        };
    }

    @ApiOperation({ summary: 'Get Bitrix app by domain and code' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app found',
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Get('get')
    async getApp(@Query() dto: GetBitrixAppDto): Promise<SuccessResponseDto> {
        const app = await this.bitrixAppService.getApp(dto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: app,
        };
    }

    @ApiOperation({ summary: 'Get all Bitrix apps' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',
    })
    @Get()
    async getAllApps(): Promise<SuccessResponseDto> {
        const apps = await this.bitrixAppService.getAllApps();
        return {
            resultCode: EResultCode.SUCCESS,
            data: apps,
        };
    }

    @ApiOperation({ summary: 'Get Bitrix apps by portal domain' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',
    })
    @Get('portal/:domain')
    async getAppsByPortal(@Param('domain') domain: string): Promise<SuccessResponseDto> {
        const apps = await this.bitrixAppService.getAppsByPortal(domain);
        return {
            resultCode: EResultCode.SUCCESS,
            data: apps,
        };
    }

    @ApiOperation({ summary: 'Get Bitrix apps by portal ID' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix apps found',
    })
    @Get('portal-id/:portalId')
    async getAppsByPortalId(@Param('portalId', ParseIntPipe) portalId: number): Promise<SuccessResponseDto> {
        const apps = await this.bitrixAppService.getAppsByPortalId(portalId);
        return {
            resultCode: EResultCode.SUCCESS,
            data: apps,
        };
    }

    @ApiOperation({ summary: 'Get enabled Bitrix apps' })
    @ApiResponse({
        status: 200,
        description: 'Enabled Bitrix apps found',
    })
    @Get('enabled')
    async getEnabledApps(): Promise<SuccessResponseDto> {
        const apps = await this.bitrixAppService.getEnabledApps();
        return {
            resultCode: EResultCode.SUCCESS,
            data: apps,
        };
    }

    @ApiOperation({ summary: 'Update Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app updated successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Put(':id')
    async updateApp(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateBitrixAppDto,
    ): Promise<SuccessResponseDto> {
        const app = await this.bitrixAppService.updateApp(id, dto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: app,
        };
    }

    @ApiOperation({ summary: 'Delete Bitrix app' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix app deleted successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'Bitrix app not found',
    })
    @Delete(':id')
    async deleteApp(@Param('id') id: string): Promise<SuccessResponseDto> {
        const result = await this.bitrixAppService.deleteApp(BigInt(id));
        return {
            resultCode: EResultCode.SUCCESS,
            data: { deleted: result },
        };
    }
}

