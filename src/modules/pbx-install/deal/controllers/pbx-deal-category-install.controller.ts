import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';

import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';
import {
    PARSE_CATEGORY_NAME_VALUES,
    ParseCategoryName,
} from '../services/categories/parse-category.service';
import { InstallDealCategoryDto } from '../dto/install-deal-category.dto';
import {
    DeleteDealCategoriesDto,
    DeleteDealCategoryStageDto,
    EditDealCategoryStageDto,
} from '../dto/manage-deal-category.dto';
import { PbxDealCategoryInstallByParseUseCase } from '../use-cases/category/pbx-deal-category-install-by-parse.use-case';
import { PbxDealCategoryInstallByCategoryUseCase } from '../use-cases/category/pbx-deal-category-install-by-category.use-case';
import { PbxDealCategoryManageUseCase } from '../use-cases/category/pbx-deal-category-manage.use-case';

@ApiTags('PBX Deal Category Install')
@Controller('pbx-deal-category-install')
export class PbxDealCategoryInstallController {
    constructor(
        private readonly parseUseCase: PbxDealCategoryInstallByParseUseCase,
        private readonly categoryUseCase: PbxDealCategoryInstallByCategoryUseCase,
        private readonly manageUseCase: PbxDealCategoryManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install deal categories by portal, group and categoryName',
        description:
            'Установить воронки сделки по "порталу", "группе" и "categoryName". ' +
            'Категории и стадии читаются из Excel-файла, сохранённого для указанной группы. ' +
            'Передайте `categoryName=all`, чтобы установить все воронки шаблона.',
    })
    @ApiParam({ name: 'domain', description: 'Domain of the portal' })
    @ApiParam({ name: 'group', enum: PbxEntityGroupEnum })
    @ApiParam({
        name: 'categoryName',
        enum: PARSE_CATEGORY_NAME_VALUES as unknown as string[],
        description:
            'Внутренний код категории (`sales_base`, `sales_xo`, ...) либо `all`.',
    })
    @Get('/install/domain/:domain/group/:group/categoryName/:categoryName')
    async installDealCategories(
        @Param('domain') domain: string,
        @Param('group') group: PbxEntityGroupEnum,
        @Param('categoryName') categoryName: ParseCategoryName,
    ) {
        return await this.parseUseCase.installDealCategories(
            domain,
            group,
            categoryName,
        );
    }

    @ApiOperation({
        summary: 'Install deal categories by provided categories data',
        description:
            'Установить воронки сделки по уже подготовленному массиву категорий. ' +
            'В отличие от GET-варианта, не читает Excel — принимает категории напрямую ' +
            'в теле запроса. Удобно для повторной установки/синхронизации и для интеграционных сценариев.',
    })
    @ApiBody({ type: InstallDealCategoryDto })
    @ApiResponse({
        status: 201,
        description:
            'Воронки и стадии успешно отправлены в Bitrix и засинхронизированы с БД April. ' +
            'Возвращает id сделки-якоря, parent-связку и список ensured-воронок.',
    })
    @Post('/install-categories/')
    async installDealCategoriesByCategoriesData(
        @Body() dto: InstallDealCategoryDto,
    ) {
        return await this.categoryUseCase.installDealCategories(dto);
    }

    @ApiOperation({
        summary: 'Delete deal categories by codes',
        description:
            'Удаляет указанные воронки сделки из PortalDB и Bitrix. ' +
            'Стадии каждой воронки в Bitrix удаляются перед удалением самой категории. ' +
            'Default-воронка (`bxCategoryId = 0`) пропускается. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteDealCategoriesDto })
    @Post('/delete-categories/')
    async deleteDealCategories(@Body() dto: DeleteDealCategoriesDto) {
        return await this.manageUseCase.deleteCategories(dto);
    }

    @ApiOperation({
        summary: 'Delete a single stage of a deal category',
        description:
            'Удаляет одну стадию воронки сделки в PortalDB и Bitrix. ' +
            'Идентификация стадии: `categoryCode` + `stageCode` в PortalDB; ' +
            'в Bitrix — по фактическому `ID` записи `crm.status`, найденному по `STATUS_ID`. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteDealCategoryStageDto })
    @Post('/delete-category-stage/')
    async deleteDealCategoryStage(
        @Body() dto: DeleteDealCategoryStageDto,
    ) {
        return await this.manageUseCase.deleteCategoryStage(dto);
    }

    @ApiOperation({
        summary: 'Edit a single stage of a deal category',
        description:
            'Обновляет `NAME`/`name`/`title` одной стадии воронки сделки в PortalDB и Bitrix. ' +
            '`code` и `bitrixId` остаются прежними. Стадия ищется по `categoryCode` + `stageCode` ' +
            'в PortalDB; в Bitrix update идёт по `ID` строки `crm.status`, найденной по `STATUS_ID`. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditDealCategoryStageDto })
    @Post('/edit-category-stage/')
    async editDealCategoryStage(
        @Body() dto: EditDealCategoryStageDto,
    ) {
        return await this.manageUseCase.editCategoryStage(dto);
    }
}
