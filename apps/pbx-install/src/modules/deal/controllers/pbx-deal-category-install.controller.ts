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
    SyncDealCategoryStageDto,
} from '../dto/manage-deal-category.dto';
import { PbxDealCategoryInstallByParseUseCase } from '../use-cases/category/pbx-deal-category-install-by-parse.use-case';
import { PbxDealCategoryInstallByCategoryUseCase } from '../use-cases/category/pbx-deal-category-install-by-category.use-case';
import { PbxDealCategoryManageUseCase } from '../use-cases/category/pbx-deal-category-manage.use-case';
import { PbxDealCategoryStageSyncUseCase } from '../use-cases/category/pbx-deal-category-stage-sync.use-case';

@ApiTags('PBX Deal Category Install')
@Controller('pbx-deal-category-install')
export class PbxDealCategoryInstallController {
    constructor(
        private readonly parseUseCase: PbxDealCategoryInstallByParseUseCase,
        private readonly categoryUseCase: PbxDealCategoryInstallByCategoryUseCase,
        private readonly manageUseCase: PbxDealCategoryManageUseCase,
        private readonly stageSyncUseCase: PbxDealCategoryStageSyncUseCase,
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
    async deleteDealCategoryStage(@Body() dto: DeleteDealCategoryStageDto) {
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
    async editDealCategoryStage(@Body() dto: EditDealCategoryStageDto) {
        return await this.manageUseCase.editCategoryStage(dto);
    }

    @ApiOperation({
        summary: 'Sync a single stage of a deal category from the template',
        description:
            'Синхронизирует ОДНУ стадию воронки сделки из Excel-шаблона группы: ' +
            'заводит её в Bitrix (`crm.status.add`) либо обновляет существующую ' +
            '(`crm.status.update`) и зеркалит строку в `btx_stages`. ' +
            'НИЧЕГО НЕ УДАЛЯЕТ — в отличие от установки воронки целиком, ' +
            'прочие стадии остаются на месте. ' +
            'Все атрибуты стадии (название, цвет, `bitrixId`, семантика, порядок) ' +
            'берутся из строки шаблона, а не из запроса. ' +
            'По умолчанию `reorder: true` — SORT остальных стадий воронки ' +
            'пересчитывается по шаблону, иначе стадия, вставленная в середину ' +
            'лестницы, встанет в Bitrix последней. ' +
            'Воронка должна быть уже установлена: этот метод её не создаёт. ' +
            'Поддерживает `domain: "all"`.',
    })
    @ApiBody({ type: SyncDealCategoryStageDto })
    @ApiResponse({
        status: 201,
        description:
            'Пер-портальный результат: что произошло со стадией в Bitrix ' +
            '(`created`/`updated`) и в PortalDB, а также список STATUS_ID, ' +
            'которым пересчитан SORT. Порталы без воронки помечаются ' +
            '`ok: false` с объяснением и не прерывают обработку остальных.',
    })
    @Post('/sync-category-stage/')
    async syncDealCategoryStage(@Body() dto: SyncDealCategoryStageDto) {
        return await this.stageSyncUseCase.syncStage(dto);
    }
}
