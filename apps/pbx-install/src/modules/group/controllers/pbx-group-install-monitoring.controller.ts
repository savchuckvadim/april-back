import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { PbxGroupMonitoringService } from '../services/pbx-group-monitoring.service';

@ApiTags('PBX Group Install Monitoring')
@Controller('pbx-group-install')
export class PbxGroupInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxGroupMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Get merged calling groups state (Bitrix + PortalDB)',
        description:
            'Возвращает смерженное по bitrixId состояние групп звонков: ' +
            'что есть в Bitrix (`sonet_group`) и в PortalDB (`callings`), а также ' +
            'расхождения (есть только в Bitrix / только в БД).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @Get('/domain/:domain')
    async getGroupData(@Param('domain') domain: string) {
        return await this.monitoringService.getPbxGroupData(domain);
    }
}
