import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { InstallSmartCategoryDto } from '../dto/install-smart-category.dto';
import {
    DeleteSmartCategoriesDto,
    DeleteSmartCategoryStageDto,
    EditSmartCategoryStageDto,
} from '../dto/manage-smart-category.dto';
import { PbxSmartCategoryInstallByParseUseCase } from '../use-cases/category/pbx-smart-category-install-by-parse.use-case';
import { PbxSmartCategoryInstallByCategoryUseCase } from '../use-cases/category/pbx-smart-category-install-by-category.use-case';
import { PbxSmartCategoryManageUseCase } from '../use-cases/category/pbx-smart-category-manage.use-case';

@ApiTags('PBX Smart Category Install')
@Controller('pbx-smart-category-install')
export class PbxSmartCategoryInstallController {
    constructor(
        private readonly parseUseCase: PbxSmartCategoryInstallByParseUseCase,
        private readonly categoryUseCase: PbxSmartCategoryInstallByCategoryUseCase,
        private readonly manageUseCase: PbxSmartCategoryManageUseCase,
    ) {}

    @ApiOperation({
        summary: 'Install smart categories by portal, smartName and group',
        description:
            'Установить воронки смарта по "порталу", "smartName" и "группе". ' +
            'Категории и стадии читаются из Excel-файла ' +
            '`install/<group>/smart/<smartName>/data.xlsx`. ' +
            'Смарт должен уже существовать на портале и в PortalDB (`smarts` row).',
    })
    @ApiParam({ name: 'domain', description: 'Домен Bitrix-портала' })
    @ApiParam({ name: 'smartName', enum: SmartNameEnum })
    @ApiParam({ name: 'group', enum: SmartGroupEnum })
    @Get('/install/domain/:domain/smartName/:smartName/group/:group')
    async installSmartCategories(
        @Param('domain') domain: string,
        @Param('smartName') smartName: SmartNameEnum,
        @Param('group') group: SmartGroupEnum,
    ): Promise<void> {
        return await this.parseUseCase.installSmartCategories(
            domain,
            smartName,
            group,
        );
    }

    @ApiOperation({
        summary: 'Install smart categories by provided categories data',
        description:
            'Установить воронки смарта по уже подготовленному массиву категорий. ' +
            'В отличие от GET-варианта, не читает Excel — принимает категории напрямую ' +
            'в теле запроса. Удобно для повторной установки/синхронизации.',
    })
    @ApiBody({ type: InstallSmartCategoryDto })
    @ApiResponse({
        status: 201,
        description:
            'Воронки и стадии успешно отправлены в Bitrix и засинхронизированы с БД April.',
    })
    @Post('/install-categories/')
    async installSmartCategoriesByCategoriesData(
        @Body() dto: InstallSmartCategoryDto,
    ): Promise<void> {
        return await this.categoryUseCase.installSmartCategories(dto);
    }

    @ApiOperation({
        summary: 'Delete smart categories by codes',
        description:
            'Удаляет указанные воронки смарта из PortalDB и Bitrix. ' +
            'Стадии каждой воронки в Bitrix удаляются перед удалением самой категории. ' +
            'Поддерживает `domain: "all"` — операция выполняется для всех порталов.',
    })
    @ApiBody({ type: DeleteSmartCategoriesDto })
    @Post('/delete-categories/')
    async deleteSmartCategories(
        @Body() dto: DeleteSmartCategoriesDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteCategories(dto);
    }

    @ApiOperation({
        summary: 'Delete a single stage of a smart category',
        description:
            'Удаляет одну стадию воронки смарта в PortalDB и Bitrix. ' +
            'Идентификация стадии: `categoryCode` + `stageCode` в PortalDB; ' +
            'в Bitrix — по `STATUS_ID`. Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: DeleteSmartCategoryStageDto })
    @Post('/delete-category-stage/')
    async deleteSmartCategoryStage(
        @Body() dto: DeleteSmartCategoryStageDto,
    ): Promise<unknown> {
        return await this.manageUseCase.deleteCategoryStage(dto);
    }

    @ApiOperation({
        summary: 'Edit a single stage of a smart category',
        description:
            'Обновляет `NAME`/`name`/`title` одной стадии воронки смарта в PortalDB и Bitrix. ' +
            '`code` и `bitrixId` остаются прежними. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: EditSmartCategoryStageDto })
    @Post('/edit-category-stage/')
    async editSmartCategoryStage(
        @Body() dto: EditSmartCategoryStageDto,
    ): Promise<unknown> {
        return await this.manageUseCase.editCategoryStage(dto);
    }
}
