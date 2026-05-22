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
import { PortalCompanyService } from '../services/portal-company.service';
import { CreatePortalCompanyDto } from '../dto/create-portal-company.dto';
import { UpdatePortalCompanyDto } from '../dto/update-portal-company.dto';
import { PortalCompanyResponseDto } from '../dto/portal-company-response.dto';
import { PortalCompanyWithFieldsResponseDto } from '../dto/portal-company-with-fields-response.dto';

@ApiTags('PBX Portal Company (DB)')
@Controller('pbx/portal-company')
export class PortalCompanyController {
    constructor(private readonly portalCompanyService: PortalCompanyService) {}

    @ApiOperation({ summary: 'Список всех компаний порталов' })
    @ApiOkResponse({ type: [PortalCompanyResponseDto] })
    @Get()
    async list(): Promise<PortalCompanyResponseDto[]> {
        return this.portalCompanyService.findMany();
    }

    @ApiOperation({
        summary:
            'Компания по portalId (не больше одной на портал по правилам сервиса)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalCompanyResponseDto })
    @ApiNotFoundResponse({ description: 'Компания не найдена' })
    @Get('by-portal/:portalId')
    async getByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalCompanyResponseDto> {
        const row = await this.portalCompanyService.findByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Компания для портала ${portalId} не найдена`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Компания + поля по portalId' })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalCompanyWithFieldsResponseDto })
    @ApiNotFoundResponse()
    @Get('by-portal/:portalId/enriched')
    async enrichedByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalCompanyWithFieldsResponseDto> {
        const row =
            await this.portalCompanyService.findWithFieldsByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Компания для портала ${portalId} не найдена`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Компания + поля по id строки btx_companies' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalCompanyWithFieldsResponseDto })
    @Get(':id/enriched')
    async enrichedById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalCompanyWithFieldsResponseDto> {
        return this.portalCompanyService.findWithFieldsByCompanyId(id);
    }

    @ApiOperation({ summary: 'Одна компания по id' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalCompanyResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalCompanyResponseDto> {
        return this.portalCompanyService.findById(id);
    }

    @ApiOperation({ summary: 'Создать компанию портала' })
    @ApiCreatedResponse({ type: PortalCompanyResponseDto })
    @Post()
    async create(
        @Body() dto: CreatePortalCompanyDto,
    ): Promise<PortalCompanyResponseDto> {
        return this.portalCompanyService.create(dto);
    }

    @ApiOperation({ summary: 'Обновить компанию' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalCompanyResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalCompanyDto,
    ): Promise<PortalCompanyResponseDto> {
        return this.portalCompanyService.update(id, dto);
    }

    @ApiOperation({
        summary: 'Удалить компанию и все привязанные PBX-поля (BTX_COMPANY)',
    })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.portalCompanyService.delete(id);
    }
}
