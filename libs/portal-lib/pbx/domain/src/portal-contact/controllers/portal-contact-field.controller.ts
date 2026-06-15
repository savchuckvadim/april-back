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
import { PortalContactService } from '../services/portal-contact.service';
import { PortalContactFieldsListResponseDto } from '../dto/portal-contact-fields-list-response.dto';
import { PbxFieldService } from '../../field';
import { PbxFieldItemEditDto } from '../../field/dto/pbx-field-item-edit.dto';

@ApiTags('PBX Portal Contact — поля')
@Controller('pbx/portal-contact/by-portal/:portalId/fields')
export class PortalContactFieldController {
    constructor(
        private readonly portalContactService: PortalContactService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    @ApiOperation({
        summary:
            'Список PBX-полей контакта портала (`PbxEntityTypePrisma.BTX_CONTACT`)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalContactFieldsListResponseDto })
    @ApiNotFoundResponse()
    @Get()
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalContactFieldsListResponseDto> {
        const full =
            await this.portalContactService.findWithFieldsByPortalId(portalId);
        if (!full) {
            throw new NotFoundException(
                `Контакт для портала ${portalId} не найден`,
            );
        }
        return { fields: full.fields };
    }

    @ApiOperation({
        summary:
            'Удалить все PBX-поля контакта портала (строка контакта в БД не удаляется)',
    })
    @ApiParam({ name: 'portalId' })
    @Delete()
    async deleteAll(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<void> {
        return this.portalContactService.deleteAllFieldsForPortal(portalId);
    }

    @ApiOperation({
        summary: 'Удалить одно PBX-поле контакта только в PortalDB',
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
