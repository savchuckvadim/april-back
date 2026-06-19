import { Controller, Get, Param } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxPortalMeasureMonitoringService } from '../services/pbx-portal-measure-monitoring.service';
import { PbxMeasureMonitoringResponseDto } from '../dto/pbx-measure-monitoring-response.dto';

@ApiTags('PBX Portal Measure Monitoring')
@Controller('pbx-portal-measure-monitoring')
export class PbxPortalMeasureMonitoringController {
    constructor(
        private readonly monitoringService: PbxPortalMeasureMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Единицы измерения портала: PortalDB ↔ Bitrix',
        description:
            'Получить «pbx»-сводку единиц измерения портала: что в PortalDB ' +
            '(`portal_measure`) и что реально в Bitrix клиента (`crm.measure.list`), ' +
            'смерженные по `bitrixId`. Плюс глобальный справочник `measures` для формы. ' +
            'Единый тип данных для отрисовки текущего состояния и формы.',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiOkResponse({ type: PbxMeasureMonitoringResponseDto })
    @Get('domain/:domain')
    async getByDomain(
        @Param('domain') domain: string,
    ): Promise<PbxMeasureMonitoringResponseDto> {
        return this.monitoringService.getByDomain(domain);
    }
}
