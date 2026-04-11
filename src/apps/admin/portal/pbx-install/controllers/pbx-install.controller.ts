import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    PbxInstallOrchestratorService,
    PbxRegistryService,
} from '@/modules/pbx-registry';
import {
    InstallForPortalDto,
    MassInstallDto,
    RegistryInfoDto,
} from '../dto/pbx-install.dto';

@ApiTags('Admin PBX Install')
@Controller('admin/pbx/install')
export class PbxInstallController {
    constructor(
        private readonly orchestrator: PbxInstallOrchestratorService,
        private readonly registry: PbxRegistryService,
    ) {}

    @ApiOperation({ summary: 'Get registry info (registered definitions)' })
    @Get('registry')
    getRegistryInfo(): RegistryInfoDto {
        const groups = this.registry.getAllGroups();
        return {
            totalGroups: groups.length,
            totalFields: this.registry.getAllFields().length,
            totalCategories: this.registry.getAllCategories().length,
            totalSmarts: this.registry.getAllSmarts().length,
            totalRpas: this.registry.getAllRpas().length,
            groups: groups.map(g => g.group),
        };
    }

    @ApiOperation({ summary: 'Install definitions for a single portal (DB-only)' })
    @Post('portal')
    async installForPortal(@Body() dto: InstallForPortalDto) {
        return await this.orchestrator.installForPortal({
            portalId: BigInt(dto.portalId),
            group: dto.group,
            withBitrixSync: dto.withBitrixSync,
        });
    }

    @ApiOperation({ summary: 'Mass install definitions for all portals (DB-only)' })
    @Post('mass')
    async massInstall(@Body() dto: MassInstallDto) {
        return await this.orchestrator.installForAllPortals({
            group: dto.group,
            withBitrixSync: dto.withBitrixSync,
        });
    }
}
