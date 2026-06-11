import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';
import {
    LeadStageMappingScreen,
    PbxLeadStageMonitoringService,
} from '../services/stages/pbx-lead-stage-monitoring.service';
import {
    getLeadStageTemplate,
    LeadStageTemplateItem,
} from '../services/stages/lead-stage-template.constants';

@ApiTags('PBX Lead Stage Install Monitoring')
@Controller('pbx-lead-stage-install-monitoring')
export class PbxLeadStageInstallMonitoringController {
    constructor(
        private readonly monitoringService: PbxLeadStageMonitoringService,
    ) {}

    @ApiOperation({
        summary: 'Get lead stage mapping screen by domain and group',
        description:
            'Экран сопоставления стадий лида: шаблонные стадии (из кода) + реальные статусы ' +
            'лида из Bitrix (`crm.status.list`, `ENTITY_ID=STATUS`) + текущее сопоставление из PortalDB. ' +
            'Стадии в Bitrix не создаются — только читаются.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('domain/:domain/group/:group')
    async getStageMappingScreen(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
    ): Promise<LeadStageMappingScreen> {
        return await this.monitoringService.getStageMappingScreen(
            domain,
            group,
        );
    }

    @ApiOperation({
        summary: 'Get lead stage template',
        description: 'Получить шаблон стадий лида для группы (из кода).',
    })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @Get('template/:group')
    getStageTemplate(
        @Param('group') group: PbxEntityGroupEnum,
    ): LeadStageTemplateItem[] {
        return getLeadStageTemplate(group);
    }
}
