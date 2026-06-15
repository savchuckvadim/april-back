import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { PbxRpaFieldMonitoringService } from '../services/fields/pbx-rpa-field-monitoring.service';
import { PbxRpaFieldSearchService } from '../services/fields/pbx-rpa-field-search.service';
import {
    PbxRpaFieldOverviewService,
    RpaOverviewResult,
} from '../services/fields/pbx-rpa-field-overview.service';

@ApiTags('PBX RPA Field Install Monitoring')
@Controller('pbx-rpa-field-install')
export class PbxRpaFieldInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxRpaFieldMonitoringService,
        private readonly searchService: PbxRpaFieldSearchService,
        private readonly overviewService: PbxRpaFieldOverviewService,
    ) {}

    @ApiOperation({
        summary: 'Полная сводка полей RPA по всем порталам',
        description:
            'Все порталы × все rpaName × все group: по каждому полю — шаблон ' +
            '(истина) / PortalDB / живой Bitrix и статус. Поля, установленные в ' +
            'Bitrix без шаблона, помечаются `bitrix_only` (кандидат на merge ' +
            'Bitrix→DB). Комбо без шаблона и без установки не включаются.',
    })
    @Get('all')
    async getAllPortals(): Promise<RpaOverviewResult> {
        return await this.overviewService.getAllPortals();
    }

    @ApiOperation({
        summary: 'Monitoring: RPA fields by domain',
        description:
            'Смерженное состояние полей RPA: PortalDB (`t_fields`) против полного ' +
            'постраничного состояния Bitrix по `userfieldconfig` (читается через `getAll`, ' +
            'а не одной страницей `list`, иначе поля сверх ~50 на страницу не попадают в сводку).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @Get('domain/:domain/rpaName/:rpaName')
    async getByDomain(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
    ) {
        return this.monitoringService.getPbxRpaFieldsByDomain(domain, rpaName);
    }

    @ApiOperation({
        summary: 'Search RPA fields',
        description:
            'Поиск полей RPA по подстроке в `name`/`code`/`bxFieldName` шаблона с подложенным состоянием БД/Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @ApiParam({ name: 'search', description: 'Поисковая подстрока' })
    @Get('search/:domain/:rpaName/:group/:search')
    async search(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
        @Param('search') search: string,
    ) {
        return this.searchService.search(domain, rpaName, group, search);
    }
}
