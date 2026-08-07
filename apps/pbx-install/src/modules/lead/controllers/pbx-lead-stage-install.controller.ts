import { Body, Controller, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { MapLeadStagesDto } from '../dto/map-lead-stages.dto';
import {
    InstallLeadStagesDto,
    InstallLeadStagesResponseDto,
} from '../dto/install-lead-stages.dto';
import {
    LeadStageMapResult,
    MapLeadStagesUseCase,
} from '../use-cases/stage/map-lead-stages.use-case';
import { InstallLeadStagesUseCase } from '../use-cases/stage/install-lead-stages.use-case';

@ApiTags('PBX Lead Stage Install')
@Controller('pbx-lead-stage-install')
export class PbxLeadStageInstallController {
    constructor(
        private readonly mapUseCase: MapLeadStagesUseCase,
        private readonly installUseCase: InstallLeadStagesUseCase,
    ) {}

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

    @ApiOperation({
        summary: 'Установить стадии лида шаблона в Bitrix (аддитивно)',
        description:
            'Создаёт/обновляет в Bitrix (crm.status, ENTITY_ID=STATUS) только ' +
            'стадии шаблона с installMode=create — «Взята в работу», «Работа ' +
            'с компанией» и т.п. Чужие статусы портала НЕ удаляются и не ' +
            'изменяются никогда. Результат пишется в btx_stages, кэш портала ' +
            'сбрасывается. map-only стадии по-прежнему сопоставляются ' +
            'вручную через /map/.',
    })
    @ApiBody({
        type: InstallLeadStagesDto,
        description: 'Домен, группа и (опционально) коды стадий шаблона.',
    })
    @ApiOkResponse({
        type: InstallLeadStagesResponseDto,
        description: 'Стадии установлены; по каждой — created/updated/skipped.',
    })
    @Post('/install/')
    async installStages(
        @Body() dto: InstallLeadStagesDto,
    ): Promise<InstallLeadStagesResponseDto> {
        return await this.installUseCase.execute(dto);
    }
}
