import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { InstallRpaUseCase } from '../use-cases/install-rpa.use-case';
import { GetPbxRpaUseCase } from '../use-cases/get-pbx-rpa.use-case';
import { DeletePbxRpaUseCase } from '../use-cases/delete-pbx-rpa.use-case';

@ApiTags('PBX RPA Install')
@Controller('pbx-rpa-install')
export class PbxRpaInstallController {
    constructor(
        private readonly installRpaUseCase: InstallRpaUseCase,
        private readonly getPbxRpaUseCase: GetPbxRpaUseCase,
        private readonly deletePbxRpaUseCase: DeletePbxRpaUseCase,
    ) {}

    @ApiOperation({
        summary: 'Get RPAs by domain',
        description: 'Получить все RPA-процессы портала (зеркало PortalDB).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @Get('domain/:domain')
    async getRpasByDomain(@Param('domain') domain: string) {
        return this.getPbxRpaUseCase.getPbxAllRpas(domain, true);
    }

    @ApiOperation({
        summary: 'Get RPA by portal and name',
        description: 'Получить один RPA по домену и имени.',
    })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'withBitrix', description: 'Подгружать данные Bitrix' })
    @Get('domain/:domain/rpa/:rpaName/withBitrix/:withBitrix')
    async getRpaByPortalAndName(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('withBitrix') withBitrix: boolean,
    ) {
        return this.getPbxRpaUseCase.getPbxRpaByName({
            domain,
            rpaName,
            withBitrix,
        });
    }

    @ApiOperation({
        summary: 'Install RPA',
        description:
            'Установить RPA целиком: тип (`rpa.type.add`) + поля + воронка/стадии (`rpa.stage.*`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @Get('install/domain/:domain/rpa/:rpaName/:group')
    async installRpa(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
    ) {
        return this.installRpaUseCase.execute({ domain, rpaName, group });
    }

    @ApiOperation({
        summary: 'Delete installed RPA',
        description:
            'Удалить RPA из PortalDB (поля + категория + строка) и опционально в Bitrix.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiQuery({
        name: 'withBitrix',
        required: false,
        description: 'Если true — удалить и в Bitrix (`rpa.type.delete`)',
    })
    @Delete('install/domain/:domain/rpa/:rpaName')
    async deleteRpa(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Query('withBitrix') withBitrix: boolean = false,
    ) {
        return this.deletePbxRpaUseCase.execute(rpaName, domain, withBitrix);
    }
}
