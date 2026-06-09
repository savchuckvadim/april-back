import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { PbxDepartamentMonitoringService } from '../services/pbx-departament-monitoring.service';

@ApiTags('PBX Departament Install Monitoring')
@Controller('pbx-departament-install')
export class PbxDepartamentInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxDepartamentMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Get merged departaments state (PortalDB + read-only Bitrix)',
        description:
            'Возвращает смерженное по bitrixId состояние отделов: что есть в ' +
            'PortalDB (`departaments`) и read-only список отделов Bitrix ' +
            '(`department.get`), а также расхождения (есть только в БД / только в Bitrix). ' +
            'В Bitrix ничего не записывается.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @Get('/domain/:domain')
    async getDepartamentData(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxDepartamentData(domain);
    }
}
