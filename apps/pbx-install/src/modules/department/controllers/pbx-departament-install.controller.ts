import {
    Body,
    Controller,
    Delete,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PbxDepartamentGroupEnum } from '@lib/portal-lib/pbx/app-type';
import { UpdatePortalDepartamentDto } from '@lib/portal-lib/pbx-domain/portal-departament';
import { PbxDepartamentInstallUseCase } from '../use-cases/pbx-departament-install.use-case';
import { InstallDepartamentDto } from '../dto/install-departament.dto';

@ApiTags('PBX Departament Install')
@Controller('pbx-departament-install')
export class PbxDepartamentInstallController {
    constructor(private readonly useCase: PbxDepartamentInstallUseCase) {}

    @ApiOperation({
        summary: 'Install departament by portal and group',
        description:
            'Устанавливает отдел (ОП/ОС) на портал. В отличие от остальных модулей ' +
            'в сам Bitrix ничего не записывается: `bitrixId` (id уже существующего ' +
            'отдела в структуре Bitrix) приходит в теле запроса. Имя/заголовок отдела ' +
            'фиксированы и берутся по выбранной группе. В PortalDB (`departaments`) ' +
            'делается upsert по ключу type + group + portalId — повторный вызов не плодит дубликаты.',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'group', enum: PbxDepartamentGroupEnum })
    @ApiResponse({
        status: 201,
        description:
            'Возвращает результат синхронизации с БД (`portalResult`).',
    })
    @Post('/install/domain/:domain/group/:group')
    async installDepartament(
        @Param('domain') domain: string,
        @Param('group') group: PbxDepartamentGroupEnum,
        @Body() dto: InstallDepartamentDto,
    ) {
        return await this.useCase.installDepartament(
            domain,
            group,
            dto.bitrixId,
        );
    }

    @ApiOperation({
        summary: 'Update departament by id',
        description:
            'Точечно обновляет отдел в PortalDB (`departaments`) по id строки: ' +
            'name / title / bitrixId. type / group / портал менять нельзя.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @Patch('/:id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalDepartamentDto,
    ) {
        return await this.useCase.update(id, dto);
    }

    @ApiOperation({
        summary: 'Delete departament by id',
        description: 'Удаляет отдел из PortalDB (`departaments`) по id строки.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @Delete('/:id')
    async delete(@Param('id', ParseIntPipe) id: number) {
        await this.useCase.delete(id);
        return { success: true };
    }
}
