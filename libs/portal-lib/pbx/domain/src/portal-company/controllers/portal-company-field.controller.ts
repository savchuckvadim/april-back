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
import { PortalCompanyService } from '../services/portal-company.service';
import { PortalCompanyFieldsListResponseDto } from '../dto/portal-company-fields-list-response.dto';

@ApiTags('PBX Portal Company — поля')
@Controller('pbx/portal-company/by-portal/:portalId/fields')
export class PortalCompanyFieldController {
    constructor(private readonly portalCompanyService: PortalCompanyService) {}

    @ApiOperation({
        summary:
            'Список PBX-полей компании портала (`PbxEntityTypePrisma.BTX_COMPANY`)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalCompanyFieldsListResponseDto })
    @ApiNotFoundResponse()
    @Get()
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalCompanyFieldsListResponseDto> {
        const full =
            await this.portalCompanyService.findWithFieldsByPortalId(portalId);
        if (!full) {
            throw new NotFoundException(
                `Компания для портала ${portalId} не найдена`,
            );
        }
        return { fields: full.fields };
    }

    @ApiOperation({
        summary:
            'Удалить все PBX-поля компании портала (строка компании в БД не удаляется)',
    })
    @ApiParam({ name: 'portalId' })
    @Delete()
    async deleteAll(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<void> {
        return this.portalCompanyService.deleteAllFieldsForPortal(portalId);
    }
}
