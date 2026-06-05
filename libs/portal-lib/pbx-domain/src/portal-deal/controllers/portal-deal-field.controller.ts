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
import { PortalDealService } from '../services/portal-deal.service';
import { PortalDealFieldsListResponseDto } from '../dto/portal-deal-fields-list-response.dto';

@ApiTags('PBX Portal Deal — поля')
@Controller('pbx/portal-deal/by-portal/:portalId/fields')
export class PortalDealFieldController {
    constructor(private readonly portalDealService: PortalDealService) {}

    @ApiOperation({
        summary: 'Список PBX-полей сделки портала (`PbxEntityTypePrisma.DEAL`)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalDealFieldsListResponseDto })
    @ApiNotFoundResponse()
    @Get()
    async list(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalDealFieldsListResponseDto> {
        const full =
            await this.portalDealService.findWithFieldsByPortalId(portalId);
        if (!full) {
            throw new NotFoundException(
                `Сделка для портала ${portalId} не найдена`,
            );
        }
        return { fields: full.fields };
    }

    @ApiOperation({
        summary:
            'Удалить все PBX-поля сделки портала (строка сделки в БД не удаляется)',
    })
    @ApiParam({ name: 'portalId' })
    @Delete()
    async deleteAll(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<void> {
        return this.portalDealService.deleteAllFieldsForPortal(portalId);
    }
}
