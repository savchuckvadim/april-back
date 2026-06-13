import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
} from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PbxUserService } from '../services/pbx-user.service';
import { PbxFieldService } from '../../field';
import { PbxUserFieldsListResponseDto } from '../dto/pbx-user-fields-list-response.dto';
import { PbxUserFieldItemEditDto } from '../dto/pbx-user-field-item-edit.dto';

/**
 * Управление PBX-полями пользователя (сущность BtxUser) **только в PortalDB**.
 *
 * Bitrix не затрагивается — это слой администрирования БД (например, чтобы
 * почистить рассинхрон). Комбинированные операции (PortalDB + Bitrix) живут в
 * приложении pbx-install (контроллер pbx-user-install).
 */
@ApiTags('PBX Portal User — поля (DB)')
@Controller('pbx/portal-user/by-portal/:portalId/fields')
export class PbxUserFieldController {
    constructor(
        private readonly pbxUserService: PbxUserService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    @ApiOperation({
        summary: 'Список PBX-полей пользователя портала из PortalDB',
        description:
            'Возвращает поля пользователя (BtxUser) портала так, как они ' +
            'хранятся в PortalDB. Bitrix не запрашивается.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала в PortalDB.',
        example: 1,
    })
    @ApiOkResponse({ type: PbxUserFieldsListResponseDto })
    @ApiNotFoundResponse({ description: 'Пользователь портала не найден' })
    @Get()
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PbxUserFieldsListResponseDto> {
        const user = await this.pbxUserService.findByPortalId(String(portalId));
        return { fields: user.fields };
    }

    @ApiOperation({
        summary: 'Удалить одно PBX-поле пользователя только в PortalDB',
        description:
            'Удаляет запись поля из PortalDB. Поле в Bitrix остаётся ' +
            'нетронутым.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала в PortalDB.',
        example: 1,
    })
    @ApiParam({
        name: 'fieldId',
        description: 'Идентификатор записи поля (bitrixfields.id) в PortalDB.',
        example: '42',
    })
    @Delete(':fieldId')
    async deleteField(@Param('fieldId') fieldId: string): Promise<void> {
        return this.pbxFieldService.deleteField(fieldId);
    }

    @ApiOperation({
        summary: 'Удалить один элемент списка поля только в PortalDB',
        description:
            'Удаляет элемент enumeration-поля из PortalDB ' +
            '(bitrixfield_items). Элемент в Bitrix остаётся нетронутым.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала в PortalDB.',
        example: 1,
    })
    @ApiParam({
        name: 'fieldId',
        description: 'Идентификатор записи поля (bitrixfields.id) в PortalDB.',
        example: '42',
    })
    @ApiParam({
        name: 'itemId',
        description:
            'Идентификатор записи элемента списка (bitrixfield_items.id) ' +
            'в PortalDB.',
        example: '100',
    })
    @Delete(':fieldId/items/:itemId')
    async deleteFieldItem(@Param('itemId') itemId: string): Promise<void> {
        return this.pbxFieldService.deleteFieldItem(itemId);
    }

    @ApiOperation({
        summary: 'Переименовать элемент списка поля только в PortalDB',
        description:
            'Обновляет name/title элемента enumeration-поля в PortalDB. ' +
            'Code элемента и значение в Bitrix не меняются.',
    })
    @ApiParam({
        name: 'portalId',
        description: 'Идентификатор портала в PortalDB.',
        example: 1,
    })
    @ApiParam({
        name: 'fieldId',
        description: 'Идентификатор записи поля (bitrixfields.id) в PortalDB.',
        example: '42',
    })
    @ApiParam({
        name: 'itemId',
        description:
            'Идентификатор записи элемента списка (bitrixfield_items.id) ' +
            'в PortalDB.',
        example: '100',
    })
    @ApiOkResponse({ description: 'Элемент переименован в PortalDB.' })
    @Patch(':fieldId/items/:itemId')
    async editFieldItem(
        @Param('itemId') itemId: string,
        @Body() dto: PbxUserFieldItemEditDto,
    ): Promise<void> {
        await this.pbxFieldService.updateFieldItemNameById(
            itemId,
            dto.newValue,
        );
    }
}
