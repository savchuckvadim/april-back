import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PbxCallingGroupEnum } from '@lib/portal-lib/pbx/app-type';
import { PbxGroupInstallUseCase } from '../use-cases/pbx-group-install.use-case';

@ApiTags('PBX Group Install')
@Controller('pbx-group-install')
export class PbxGroupInstallController {
    constructor(private readonly useCase: PbxGroupInstallUseCase) {}

    @ApiOperation({
        summary: 'Install calling group by portal and group',
        description:
            'Устанавливает группу звонков (рабочую группу Bitrix `sonet_group`) на портал. ' +
            'Имя/заголовок группы фиксированы и берутся по выбранной группе (ОП/ОС Звонки). ' +
            'В Bitrix группа создаётся или обновляется; в PortalDB (`callings`) делается upsert ' +
            'по ключу type + group + portalId — повторный вызов не плодит дубликаты.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'group', enum: PbxCallingGroupEnum })
    @ApiResponse({
        status: 200,
        description:
            'Возвращает результат в Bitrix (`bxResult`: bitrixId + был ли создан) ' +
            'и результат синхронизации с БД (`portalResult`).',
    })
    @Get('/install/domain/:domain/group/:group')
    async installGroup(
        @Param('domain') domain: string,
        @Param('group') group: PbxCallingGroupEnum,
    ) {
        return await this.useCase.installGroup(domain, group);
    }
}
