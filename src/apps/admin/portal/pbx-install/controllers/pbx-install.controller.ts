import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PbxAdminService } from '../services/pbx-admin.service';
import { PbxTestService } from '../services/pbx-test.service';
import {
    InstallForPortalDto,
    MassInstallDto,
    RegistryInfoDto,
    PortalStatusDto,
    TestFieldReadDto,
    TestFieldWriteDto,
} from '../dto/pbx-install.dto';

@ApiTags('Admin PBX Install')
@Controller('admin/pbx/install')
export class PbxInstallController {
    constructor(
        private readonly adminService: PbxAdminService,
        private readonly testService: PbxTestService,
    ) {}

    @ApiOperation({
        summary: 'Get registry overview (all registered definitions)',
    })
    @Get('registry')
    getRegistryInfo(): RegistryInfoDto {
        return this.adminService.getRegistryInfo();
    }

    @ApiOperation({ summary: 'Get all fields for a group' })
    @Get('registry/fields/:group')
    getFieldsByGroup(@Param('group') group: string) {
        return this.adminService.getFieldsByGroup(group);
    }

    @ApiOperation({ summary: 'Get all categories for a group' })
    @Get('registry/categories/:group')
    getCategoriesByGroup(@Param('group') group: string) {
        return this.adminService.getCategoriesByGroup(group);
    }

    @ApiOperation({ summary: 'Get all smart definitions' })
    @Get('registry/smarts')
    getSmarts() {
        return this.adminService.getSmarts();
    }

    @ApiOperation({ summary: 'Get all RPA definitions' })
    @Get('registry/rpas')
    getRpas() {
        return this.adminService.getRpas();
    }

    @ApiOperation({
        summary: 'Search field definition by code across all groups',
    })
    @Get('registry/field/:code')
    getFieldByCode(@Param('code') code: string) {
        return this.adminService.getFieldByCode(code);
    }

    @ApiOperation({ summary: 'Install definitions for a single portal' })
    @Post('portal')
    async installForPortal(@Body() dto: InstallForPortalDto) {
        return this.adminService.installForPortal(
            dto.portalId,
            dto.group,
            dto.withBitrixSync,
        );
    }

    @ApiOperation({ summary: 'Mass install definitions for all portals' })
    @Post('mass')
    async massInstall(@Body() dto: MassInstallDto) {
        return this.adminService.massInstall(dto.group, dto.withBitrixSync);
    }

    @ApiOperation({
        summary: 'Get what is installed/not installed for a portal',
    })
    @Post('portal/status')
    async getPortalStatus(@Body() dto: PortalStatusDto) {
        return this.adminService.getPortalStatus(dto.domain);
    }

    @ApiOperation({
        summary: 'Test: resolve PbxEntityContext and read entity values',
    })
    @Post('test/read')
    async testRead(@Body() dto: TestFieldReadDto) {
        return this.testService.testRead(dto);
    }

    @ApiOperation({
        summary: 'Test: build payload from field codes and write to Bitrix',
    })
    @Post('test/write')
    async testWrite(@Body() dto: TestFieldWriteDto) {
        return this.testService.testWrite(dto);
    }
}
