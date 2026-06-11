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
import { PortalLeadService } from '../services/portal-lead.service';
import { CreatePortalLeadDto } from '../dto/create-portal-lead.dto';
import { UpdatePortalLeadDto } from '../dto/update-portal-lead.dto';
import { PortalLeadResponseDto } from '../dto/portal-lead-response.dto';
import { PortalLeadWithFieldsResponseDto } from '../dto/portal-lead-with-fields-response.dto';

@ApiTags('PBX Portal Lead (DB)')
@Controller('pbx/portal-lead')
export class PortalLeadController {
    constructor(private readonly portalLeadService: PortalLeadService) {}

    @ApiOperation({ summary: 'Список всех лидов порталов' })
    @ApiOkResponse({ type: [PortalLeadResponseDto] })
    @Get()
    async list(): Promise<PortalLeadResponseDto[]> {
        return this.portalLeadService.findMany();
    }

    @ApiOperation({
        summary:
            'Лид по portalId (не больше одного на портал по правилам сервиса)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalLeadResponseDto })
    @ApiNotFoundResponse({ description: 'Лид не найден' })
    @Get('by-portal/:portalId')
    async getByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalLeadResponseDto> {
        const row = await this.portalLeadService.findByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Лид для портала ${portalId} не найден`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Лид + поля по portalId' })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalLeadWithFieldsResponseDto })
    @ApiNotFoundResponse()
    @Get('by-portal/:portalId/enriched')
    async enrichedByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalLeadWithFieldsResponseDto> {
        const row =
            await this.portalLeadService.findWithFieldsByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Лид для портала ${portalId} не найден`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Лид + поля по id строки btx_leads' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalLeadWithFieldsResponseDto })
    @Get(':id/enriched')
    async enrichedById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalLeadWithFieldsResponseDto> {
        return this.portalLeadService.findWithFieldsByLeadId(id);
    }

    @ApiOperation({ summary: 'Один лид по id' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalLeadResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalLeadResponseDto> {
        return this.portalLeadService.findById(id);
    }

    @ApiOperation({ summary: 'Создать лид портала' })
    @ApiCreatedResponse({ type: PortalLeadResponseDto })
    @Post()
    async create(
        @Body() dto: CreatePortalLeadDto,
    ): Promise<PortalLeadResponseDto> {
        return this.portalLeadService.create(dto);
    }

    @ApiOperation({ summary: 'Обновить лид' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalLeadResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalLeadDto,
    ): Promise<PortalLeadResponseDto> {
        return this.portalLeadService.update(id, dto);
    }

    @ApiOperation({
        summary: 'Удалить лид и все привязанные PBX-поля (LEAD)',
    })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.portalLeadService.delete(id);
    }
}
