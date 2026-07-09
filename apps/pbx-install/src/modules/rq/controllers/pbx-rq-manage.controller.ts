import { Body, Controller, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalRqResponseDto } from '@lib/portal-lib/pbx-domain/portal-rq';
import { RqManageUseCase } from '../use-cases/rq-manage.use-case';
import { RqSetPresetBitrixIdUseCase } from '../use-cases/rq-set-preset-bitrix-id.use-case';
import { DeleteRqByIdsDto } from '../dto/install-rq.dto';
import { RqDeleteResultDto } from '../dto/rq-response.dto';
import { SetRqPresetBitrixIdDto } from '../dto/set-rq-preset-bitrix-id.dto';

@ApiTags('PBX Rq Manage')
@Controller('pbx-rq-install')
export class PbxRqManageController {
    constructor(
        private readonly useCase: RqManageUseCase,
        private readonly setPresetBitrixIdUseCase: RqSetPresetBitrixIdUseCase,
    ) {}

    @ApiOperation({
        summary: 'Привязать bitrixId к пресету реквизита (upsert в БД)',
        description:
            'Ручная привязка существующего пресета Bitrix к строке `bx_rqs` ' +
            'по бизнес-коду. Меняется только зеркало в БД, в Bitrix ничего не ' +
            'создаётся и не меняется. Существование id проверяется через ' +
            '`crm.requisite.preset.get` (404, если пресета нет).',
    })
    @ApiBody({
        type: SetRqPresetBitrixIdDto,
        description: 'Домен, бизнес-код пресета и bitrixId для привязки.',
    })
    @ApiOkResponse({
        type: PortalRqResponseDto,
        description: 'Обновлённая/созданная строка `bx_rqs`.',
    })
    @Post('/set-preset-bitrix-id')
    async setPresetBitrixId(
        @Body() dto: SetRqPresetBitrixIdDto,
    ): Promise<PortalRqResponseDto> {
        return await this.setPresetBitrixIdUseCase.setBitrixId(dto);
    }

    @ApiOperation({
        summary: 'Удалить пресеты реквизитов в Bitrix',
        description:
            'Точечное удаление пресетов (`crm.requisite.preset.delete`) по списку ' +
            'bitrix-id. Толерантно к ошибкам по отдельному id.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiBody({
        type: DeleteRqByIdsDto,
        description: 'Список bitrix-id пресетов для удаления.',
    })
    @ApiOkResponse({
        type: RqDeleteResultDto,
        description: 'deleted[] и failed[].',
    })
    @Post('/delete-presets/domain/:domain')
    async deletePresets(
        @Param('domain') domain: string,
        @Body() body: DeleteRqByIdsDto,
    ): Promise<RqDeleteResultDto> {
        return await this.useCase.deletePresets(domain, body.ids);
    }

    @ApiOperation({
        summary: 'Удалить пользовательские поля реквизита в Bitrix',
        description:
            'Точечное удаление полей (`crm.requisite.userfield.delete`) по списку id. ' +
            'Толерантно к ошибкам по отдельному id.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiBody({
        type: DeleteRqByIdsDto,
        description: 'Список id полей реквизита для удаления.',
    })
    @ApiOkResponse({
        type: RqDeleteResultDto,
        description: 'deleted[] и failed[].',
    })
    @Post('/delete-fields/domain/:domain')
    async deleteFields(
        @Param('domain') domain: string,
        @Body() body: DeleteRqByIdsDto,
    ): Promise<RqDeleteResultDto> {
        return await this.useCase.deleteFields(domain, body.ids);
    }
}
