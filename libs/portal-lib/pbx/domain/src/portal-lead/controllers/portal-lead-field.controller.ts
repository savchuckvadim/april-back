import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
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
import { PortalLeadService } from '../services/portal-lead.service';
import { PortalLeadFieldsListResponseDto } from '../dto/portal-lead-fields-list-response.dto';
import { PbxFieldService } from '../../field';
import { PbxFieldItemEditDto } from '../../field/dto/pbx-field-item-edit.dto';

@ApiTags('PBX Portal Lead — поля')
@Controller('pbx/portal-lead/by-portal/:portalId/fields')
export class PortalLeadFieldController {
    constructor(
        private readonly portalLeadService: PortalLeadService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    @ApiOperation({
        summary: 'Список PBX-полей лида портала (`PbxEntityTypePrisma.LEAD`)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalLeadFieldsListResponseDto })
    @ApiNotFoundResponse()
    @Get()
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalLeadFieldsListResponseDto> {
        const full =
            await this.portalLeadService.findWithFieldsByPortalId(portalId);
        if (!full) {
            throw new NotFoundException(
                `Лид для портала ${portalId} не найден`,
            );
        }
        return { fields: full.fields };
    }

    @ApiOperation({
        summary:
            'Удалить все PBX-поля лида портала (строка лида в БД не удаляется)',
    })
    @ApiParam({ name: 'portalId' })
    @Delete()
    async deleteAll(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<void> {
        return this.portalLeadService.deleteAllFieldsForPortal(portalId);
    }

    @ApiOperation({
        summary: 'Удалить одно PBX-поле лида только в PortalDB',
        description: 'Удаляет запись поля из PortalDB. В Bitrix поле остаётся.',
    })
    @ApiParam({ name: 'portalId' })
    @ApiParam({
        name: 'fieldId',
        description: 'Идентификатор записи поля (bitrixfields.id) в PortalDB.',
    })
    @Delete(':fieldId')
    async deleteField(@Param('fieldId') fieldId: string): Promise<void> {
        return this.pbxFieldService.deleteField(fieldId);
    }

    @ApiOperation({
        summary: 'Удалить элемент списка поля только в PortalDB',
        description:
            'Удаляет элемент enumeration-поля из PortalDB. В Bitrix остаётся.',
    })
    @ApiParam({ name: 'portalId' })
    @ApiParam({ name: 'fieldId' })
    @ApiParam({
        name: 'itemId',
        description:
            'Идентификатор элемента (bitrixfield_items.id) в PortalDB.',
    })
    @Delete(':fieldId/items/:itemId')
    async deleteFieldItem(@Param('itemId') itemId: string): Promise<void> {
        return this.pbxFieldService.deleteFieldItem(itemId);
    }

    @ApiOperation({
        summary: 'Переименовать элемент списка поля только в PortalDB',
        description:
            'Обновляет name/title элемента в PortalDB. В Bitrix не меняется.',
    })
    @ApiParam({ name: 'portalId' })
    @ApiParam({ name: 'fieldId' })
    @ApiParam({
        name: 'itemId',
        description:
            'Идентификатор элемента (bitrixfield_items.id) в PortalDB.',
    })
    @ApiOkResponse({ description: 'Элемент переименован в PortalDB.' })
    @Patch(':fieldId/items/:itemId')
    async editFieldItem(
        @Param('itemId') itemId: string,
        @Body() dto: PbxFieldItemEditDto,
    ): Promise<void> {
        await this.pbxFieldService.updateFieldItemNameById(
            itemId,
            dto.newValue,
        );
    }
}
