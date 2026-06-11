import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MapLeadStagesDto } from '../dto/map-lead-stages.dto';
import {
    LeadStageMapResult,
    MapLeadStagesUseCase,
} from '../use-cases/stage/map-lead-stages.use-case';

@ApiTags('PBX Lead Stage Install')
@Controller('pbx-lead-stage-install')
export class PbxLeadStageInstallController {
    constructor(private readonly mapUseCase: MapLeadStagesUseCase) {}

    @ApiOperation({
        summary: 'Map lead template stages to Bitrix lead statuses',
        description:
            'Сопоставляет шаблонные стадии лида с реальными статусами лида из Bitrix (один-к-одному) ' +
            'и пишет результат в PortalDB (`btx_stages`): данные из шаблона + `bitrixId = STATUS_ID`. ' +
            'В Bitrix стадии НЕ создаются. Несопоставленные шаблонные стадии не сохраняются.',
    })
    @ApiBody({ type: MapLeadStagesDto })
    @ApiResponse({
        status: 201,
        description:
            'Сопоставление сохранено. Возвращает id лида и категории в PortalDB ' +
            'и список записанных стадий (`upserted`).',
    })
    @Post('/map/')
    async mapStages(
        @Body() dto: MapLeadStagesDto,
    ): Promise<LeadStageMapResult> {
        return await this.mapUseCase.apply(dto);
    }
}
