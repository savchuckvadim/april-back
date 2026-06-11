import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxCallingGroupEnum } from '@lib/portal-lib/pbx/app-type';
import { PortalCallingResponseDto } from '@lib/portal-lib/pbx-domain/portal-calling';
import { PbxGroupInstallUseCase } from '../use-cases/pbx-group-install.use-case';
import { PbxCallingSetBitrixIdUseCase } from '../use-cases/pbx-calling-set-bitrix-id.use-case';
import { SetCallingBitrixIdDto } from '../dto/set-calling-bitrix-id.dto';

@ApiTags('PBX Group Install')
@Controller('pbx-group-install')
export class PbxGroupInstallController {
    constructor(
        private readonly useCase: PbxGroupInstallUseCase,
        private readonly setBitrixIdUseCase: PbxCallingSetBitrixIdUseCase,
    ) {}

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

    @ApiOperation({
        summary: 'Set bitrixId for a calling group by code (upsert)',
        description:
            'Ручная привязка: принимает код группы звонков (`group`) и `bitrixId`, ' +
            'записывает `bitrixId` в строку `callings` по ключу type + group + portalId. ' +
            'Если строка есть — обновляется только `bitrixId`; если нет — создаётся. ' +
            'Ключ уникален: двух строк одной группы (например, двух `sales`) на портале быть не может. ' +
            'В Bitrix ничего не создаётся и не меняется.',
    })
    @ApiBody({ type: SetCallingBitrixIdDto })
    @ApiResponse({
        status: 201,
        description: 'Обновлённая строка группы звонков из PortalDB.',
        type: PortalCallingResponseDto,
    })
    @Post('/set-bitrix-id/')
    async setBitrixId(
        @Body() dto: SetCallingBitrixIdDto,
    ): Promise<PortalCallingResponseDto> {
        return await this.setBitrixIdUseCase.setBitrixId(dto);
    }
}
