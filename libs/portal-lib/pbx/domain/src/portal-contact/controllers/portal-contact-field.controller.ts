import {
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
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

@ApiTags('PBX Portal Contact — поля')
@Controller('pbx/portal-contact/by-portal/:portalId/fields')
export class PortalContactFieldController {
    constructor(private readonly portalContactService: PortalContactService) {}

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
}
