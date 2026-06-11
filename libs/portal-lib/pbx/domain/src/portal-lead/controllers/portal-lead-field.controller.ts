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
import { PortalLeadService } from '../services/portal-lead.service';
import { PortalLeadFieldsListResponseDto } from '../dto/portal-lead-fields-list-response.dto';

@ApiTags('PBX Portal Lead — поля')
@Controller('pbx/portal-lead/by-portal/:portalId/fields')
export class PortalLeadFieldController {
    constructor(private readonly portalLeadService: PortalLeadService) {}

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
}
