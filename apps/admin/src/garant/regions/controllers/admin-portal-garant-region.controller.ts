import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    BadRequestException,
    NotFoundException,
    Delete,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiQuery,
    ApiBody,
} from '@nestjs/swagger';
import { PortalRegionService } from '../services/portal-region.service';
import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';
import { CreatePortalRegionDtoAdminRequest } from '../dto/request/create-portal-region-request.dto';
import { UpdatePortalRegionDtoAdmin } from '../dto/request/update-portal-region-request.dto';
import {
    BulkSetPortalRegionsDto,
    BulkSetPortalRegionsResultDto,
} from '../dto/request/bulk-set-portal-regions.dto';

@ApiTags('Admin Portal Garant Region')
@Controller('admin/portal/garant/regions')
export class AdminPortalGarantRegionController {
    constructor(private readonly portalRegionService: PortalRegionService) {}

    @Get()
    @ApiQuery({
        name: 'portalId',
        type: Number,
        required: true,
        description: 'ID портала',
    })
    @ApiOperation({
        summary: 'Все регионы справочника с привязкой и своей ценой портала',
        description:
            'abs/tax/tax_abs — общий рабс региона, own_* — свои настройки портала ' +
            '(ручной рабс или регион-источник), effective_* — действующая цена.',
    })
    @ApiResponse({
        status: 200,
        description: 'Список всех регионов',
        type: [GetPortalRegionResponseDto],
    })
    async list(
        @Query('portalId') portalId: number,
    ): Promise<GetPortalRegionResponseDto[]> {
        return await this.portalRegionService.getPortalRegions(portalId);
    }

    @Post()
    @ApiBody({ type: CreatePortalRegionDtoAdminRequest })
    @ApiOperation({ summary: 'Привязать регион к порталу' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно привязан',
        type: GetPortalRegionResponseDto,
    })
    async create(
        @Body() dto: CreatePortalRegionDtoAdminRequest,
    ): Promise<GetPortalRegionResponseDto> {
        const region = await this.portalRegionService.createPortalRegion(dto);
        if (!region) {
            throw new BadRequestException('Region not created');
        }
        return region;
    }

    @Put('bulk')
    @ApiBody({
        type: BulkSetPortalRegionsDto,
        description:
            'ID портала и изменённые строки регионов (чекбокс, ручной рабс или регион-источник).',
    })
    @ApiOperation({
        summary: 'Массово применить чекбоксы и свои цены регионов портала',
        description:
            'Включает/выключает регионы портала и ставит свою цену одним запросом: ' +
            'ручной рабс (ownAbs) или регион-источник (ownAbsRegionId), чей рабс ' +
            'портал берёт за свой. Достаточно передавать только изменившиеся строки.',
    })
    @ApiResponse({
        status: 200,
        description: 'Счётчики применённых изменений и пропуски с причинами.',
        type: BulkSetPortalRegionsResultDto,
    })
    async bulkSet(
        @Body() dto: BulkSetPortalRegionsDto,
    ): Promise<BulkSetPortalRegionsResultDto> {
        return await this.portalRegionService.bulkSetPortalRegions(dto);
    }

    @Get('update-initial-data/:portalId/:regionId')
    @ApiOperation({ summary: 'Данные формы своей цены региона портала' })
    @ApiResponse({
        status: 200,
        description: 'Данные формы получены',
        type: UpdatePortalRegionDtoAdmin,
    })
    async getUpdateInitialData(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
    ): Promise<UpdatePortalRegionDtoAdmin> {
        const region =
            await this.portalRegionService.getPortalRegionUpdateInitialData(
                portalId,
                regionId,
            );
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return region;
    }

    @Put(':portalId/:regionId')
    @ApiBody({ type: UpdatePortalRegionDtoAdmin })
    @ApiOperation({
        summary: 'Обновить свою цену региона портала',
        description:
            'Ручной рабс или регион-источник; оба пустые — возврат к общему рабсу.',
    })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно обновлён',
        type: GetPortalRegionResponseDto,
    })
    async update(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
        @Body() dto: UpdatePortalRegionDtoAdmin,
    ): Promise<GetPortalRegionResponseDto> {
        const region = await this.portalRegionService.updatePortalRegion(
            portalId,
            regionId,
            dto,
        );
        if (!region) {
            throw new BadRequestException('Region not updated');
        }
        return region;
    }

    @Delete(':portalId/:regionId')
    @ApiOperation({ summary: 'Отвязать регион от портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно отвязан',
        type: Boolean,
    })
    async delete(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
    ): Promise<boolean> {
        return await this.portalRegionService.deletePortalRegion(
            portalId,
            regionId,
        );
    }
}
