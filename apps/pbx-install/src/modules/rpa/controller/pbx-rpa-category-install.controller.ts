import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { RpaGroupEnum, RpaNameEnum } from '../dto/install-rpa.dto';
import { InstallRpaCategoryDto } from '../dto/install-rpa-category.dto';
import {
    DeleteRpaCategoryStageDto,
    EditRpaCategoryStageDto,
} from '../dto/manage-rpa-category.dto';
import { PbxRpaCategoryInstallByParseUseCase } from '../use-cases/category/pbx-rpa-category-install-by-parse.use-case';
import { PbxRpaCategoryInstallByCategoryUseCase } from '../use-cases/category/pbx-rpa-category-install-by-category.use-case';
import { PbxRpaCategoryManageUseCase } from '../use-cases/category/pbx-rpa-category-manage.use-case';

@ApiTags('PBX RPA Category Install')
@Controller('pbx-rpa-category-install')
export class PbxRpaCategoryInstallController {
    constructor(
        private readonly parseUseCase: PbxRpaCategoryInstallByParseUseCase,
        private readonly categoryUseCase: PbxRpaCategoryInstallByCategoryUseCase,
        private readonly manageUseCase: PbxRpaCategoryManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install RPA category by portal, rpaName and group',
        description:
            'Установить воронку RPA и её стадии из Excel-шаблона (`rpa.stage.*` + зеркало PortalDB). ' +
            'RPA должен уже существовать в PortalDB (`btx_rpas`).',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiParam({ name: 'rpaName', enum: RpaNameEnum })
    @ApiParam({ name: 'group', enum: RpaGroupEnum })
    @Get('/install/domain/:domain/rpaName/:rpaName/group/:group')
    async installRpaCategories(
        @Param('domain') domain: string,
        @Param('rpaName') rpaName: RpaNameEnum,
        @Param('group') group: RpaGroupEnum,
    ): Promise<unknown> {
        return this.parseUseCase.installRpaCategories(domain, rpaName, group);
    }

    @ApiOperation({
        summary: 'Install RPA category by provided categories data',
        description:
            'Установить воронку RPA по готовому массиву категорий в теле запроса (без чтения Excel).',
    })
    @ApiBody({ type: InstallRpaCategoryDto })
    @ApiResponse({
        status: 201,
        description:
            'Стадии отправлены в Bitrix (`rpa.stage.*`) и засинхронизированы с БД.',
    })
    @Post('/install-categories/')
    async installRpaCategoriesByData(
        @Body() dto: InstallRpaCategoryDto,
    ): Promise<unknown> {
        return this.categoryUseCase.installRpaCategories(dto);
    }

    @ApiOperation({
        summary: 'Delete a single stage of an RPA category',
        description:
            'Удаляет одну стадию воронки RPA в PortalDB и Bitrix (`rpa.stage.delete`). ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteRpaCategoryStageDto })
    @Post('/delete-category-stage/')
    async deleteRpaCategoryStage(
        @Body() dto: DeleteRpaCategoryStageDto,
    ): Promise<unknown> {
        return this.manageUseCase.deleteCategoryStage(dto);
    }

    @ApiOperation({
        summary: 'Edit a single stage of an RPA category',
        description:
            'Обновляет название одной стадии воронки RPA в PortalDB и Bitrix (`rpa.stage.update`). ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditRpaCategoryStageDto })
    @Post('/edit-category-stage/')
    async editRpaCategoryStage(
        @Body() dto: EditRpaCategoryStageDto,
    ): Promise<unknown> {
        return this.manageUseCase.editCategoryStage(dto);
    }
}
