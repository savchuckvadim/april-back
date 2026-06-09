import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { InstallRqUseCase } from '../use-cases/install-rq.use-case';
import {
    InstallRqFieldsBodyDto,
    InstallRqPresetsBodyDto,
} from '../dto/install-rq.dto';
import { InstallRqResultDto } from '../dto/rq-response.dto';

@ApiTags('PBX Rq Install')
@Controller('pbx-rq-install')
export class PbxRqInstallController {
    constructor(private readonly useCase: InstallRqUseCase) {}

    @ApiOperation({
        summary: 'Установить эталон реквизитов (пресеты + поля)',
        description:
            'Читает TS-эталон и устанавливает в Bitrix пресеты ' +
            '(`crm.requisite.preset.*`, upsert по XML_ID) с зеркалированием в `bx_rqs`, ' +
            'и пользовательские поля (`crm.requisite.userfield.*`, gating по isNeedUpdate). ' +
            'Идемпотентно: повторный вызов обновляет существующее.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({
        type: InstallRqResultDto,
        description: 'Результат по пресетам (`presets`) и полям (`fields`).',
    })
    @Get('/install/domain/:domain')
    async install(
        @Param('domain') domain: string,
    ): Promise<InstallRqResultDto> {
        return await this.useCase.installAll(domain);
    }

    @ApiOperation({
        summary: 'Установить пресеты из тела запроса',
        description:
            'То же, что install, но пресеты приходят массивом в теле — для повторной ' +
            'синхронизации/интеграций, когда фронт сам формирует payload.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiBody({
        type: InstallRqPresetsBodyDto,
        description: 'Массив пресетов для установки.',
    })
    @ApiOkResponse({
        type: InstallRqResultDto,
        description: 'Результат установки пресетов.',
    })
    @Post('/install-presets/domain/:domain')
    async installPresets(
        @Param('domain') domain: string,
        @Body() body: InstallRqPresetsBodyDto,
    ): Promise<InstallRqResultDto> {
        return await this.useCase.installPresets(domain, body.presets);
    }

    @ApiOperation({
        summary: 'Установить поля реквизита из тела запроса',
        description:
            'Устанавливает пользовательские поля реквизита из массива в теле запроса ' +
            '(`crm.requisite.userfield.*`). Зеркала в БД нет.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiBody({
        type: InstallRqFieldsBodyDto,
        description: 'Массив полей реквизита для установки.',
    })
    @ApiOkResponse({
        type: InstallRqResultDto,
        description: 'Результат установки полей.',
    })
    @Post('/install-fields/domain/:domain')
    async installFields(
        @Param('domain') domain: string,
        @Body() body: InstallRqFieldsBodyDto,
    ): Promise<InstallRqResultDto> {
        return await this.useCase.installFields(domain, body.fields);
    }
}
