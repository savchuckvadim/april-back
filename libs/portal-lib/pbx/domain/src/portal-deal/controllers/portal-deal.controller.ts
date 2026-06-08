import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalDealService } from '../services/portal-deal.service';
import { CreatePortalDealDto } from '../dto/create-portal-deal.dto';
import { UpdatePortalDealDto } from '../dto/update-portal-deal.dto';
import { PortalDealResponseDto } from '../dto/portal-deal-response.dto';
import { PortalDealWithFieldsResponseDto } from '../dto/portal-deal-with-fields-response.dto';

@ApiTags('PBX Portal Deal (DB)')
@Controller('pbx/portal-deal')
export class PortalDealController {
    constructor(private readonly portalDealService: PortalDealService) {}

    @ApiOperation({ summary: 'Список всех сделок порталов' })
    @ApiOkResponse({ type: [PortalDealResponseDto] })
    @Get()
    async list(): Promise<PortalDealResponseDto[]> {
        return this.portalDealService.findMany();
    }

    @ApiOperation({
        summary:
            'Сделка по portalId (не больше одной на портал по правилам сервиса)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalDealResponseDto })
    @ApiNotFoundResponse({ description: 'Сделка не найдена' })
    @Get('by-portal/:portalId')
    async getByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalDealResponseDto> {
        const row = await this.portalDealService.findByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Сделка для портала ${portalId} не найдена`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Сделка + поля по portalId' })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalDealWithFieldsResponseDto })
    @ApiNotFoundResponse()
    @Get('by-portal/:portalId/enriched')
    async enrichedByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalDealWithFieldsResponseDto> {
        const row =
            await this.portalDealService.findWithFieldsByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Сделка для портала ${portalId} не найдена`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Сделка + поля по id строки btx_deals' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalDealWithFieldsResponseDto })
    @Get(':id/enriched')
    async enrichedById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalDealWithFieldsResponseDto> {
        return this.portalDealService.findWithFieldsByDealId(id);
    }

    @ApiOperation({ summary: 'Одна сделка по id' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalDealResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalDealResponseDto> {
        return this.portalDealService.findById(id);
    }

    @ApiOperation({ summary: 'Создать сделку портала' })
    @ApiCreatedResponse({ type: PortalDealResponseDto })
    @Post()
    async create(
        @Body() dto: CreatePortalDealDto,
    ): Promise<PortalDealResponseDto> {
        return this.portalDealService.create(dto);
    }

    @ApiOperation({ summary: 'Обновить сделку' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalDealResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalDealDto,
    ): Promise<PortalDealResponseDto> {
        return this.portalDealService.update(id, dto);
    }

    @ApiOperation({
        summary: 'Удалить сделку и все привязанные PBX-поля (DEAL)',
    })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.portalDealService.delete(id);
    }
}
