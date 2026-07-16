import {
    Body,
    Controller,
    Delete,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { PbxDepartamentGroupEnum } from '@lib/portal-lib/pbx/app-type';
import {
    PortalDepartamentResponseDto,
    UpdatePortalDepartamentDto,
} from '@lib/portal-lib/pbx-domain/portal-departament';
import { PbxDepartamentInstallUseCase } from '../use-cases/pbx-departament-install.use-case';
import { InstallDepartamentDto } from '../dto/install-departament.dto';
import { InstallDepartamentResponseDto } from '../dto/install-departament-response.dto';
import { DeleteDepartamentResponseDto } from '../dto/delete-departament-response.dto';

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
    @ApiParam({
        name: 'group',
        description: 'Группа отдела: ОП (sales) / ОС (service)',
        enum: PbxDepartamentGroupEnum,
    })
    @ApiBody({
        type: InstallDepartamentDto,
        description:
            'ID уже существующего отдела в структуре Bitrix (`bitrixId`).',
    })
    @ApiCreatedResponse({
        type: InstallDepartamentResponseDto,
        description:
            'Возвращает результат синхронизации с БД (`portalResult`).',
    })
    @Post('/install/domain/:domain/group/:group')
    async installDepartament(
        @Param('domain') domain: string,
        @Param('group') group: PbxDepartamentGroupEnum,
        @Body() dto: InstallDepartamentDto,
    ): Promise<InstallDepartamentResponseDto> {
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
            'name / title / bitrixId / isMultiple / multipleTag (null сбрасывает тэг). ' +
            'type / group / портал менять нельзя. ' +
            'Полный CRUD по БД — см. `PBX Portal Departament (DB)` (`pbx/portal-departament`).',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @ApiBody({
        type: UpdatePortalDepartamentDto,
        description: 'Частичное обновление полей отдела.',
    })
    @ApiOkResponse({
        type: PortalDepartamentResponseDto,
        description: 'Отдел после обновления.',
    })
    @ApiNotFoundResponse({ description: 'Отдел не найден' })
    @Patch('/:id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        return await this.useCase.update(id, dto);
    }

    @ApiOperation({
        summary: 'Delete departament by id',
        description: 'Удаляет отдел из PortalDB (`departaments`) по id строки.',
    })
    @ApiParam({ name: 'id', description: 'ID строки отдела в БД' })
    @ApiOkResponse({
        type: DeleteDepartamentResponseDto,
        description: 'Признак успешного удаления.',
    })
    @ApiNotFoundResponse({ description: 'Отдел не найден' })
    @Delete('/:id')
    async delete(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<DeleteDepartamentResponseDto> {
        await this.useCase.delete(id);
        return { success: true };
    }
}
