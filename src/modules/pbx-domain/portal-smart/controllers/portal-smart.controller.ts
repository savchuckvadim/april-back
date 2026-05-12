import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
} from '@nestjs/common';
import {
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { PortalSmartService } from '../portal-smart.service';
import { CreatePortalSmartDto } from '../dto/create-portal-smart.dto';
import { UpdatePortalSmartDto } from '../dto/update-portal-smart.dto';
import { PortalSmartRowResponseDto } from '../dto/portal-smart-row-response.dto';
import { PortalSmartsListResponseDto } from '../dto/portal-smarts-list-response.dto';

@ApiTags('PBX Portal Smarts (DB)')
@Controller('pbx/portal-smarts')
export class PortalSmartController {
    constructor(private readonly portalSmartService: PortalSmartService) {}

    @ApiOperation({
        summary: 'Список смартов портала (только строки таблицы smarts)',
    })
    @ApiParam({ name: 'domain', description: 'Домен портала' })
    @ApiOkResponse({ type: PortalSmartsListResponseDto })
    @Get('by-domain/:domain')
    async listByDomain(
        @Param('domain') domain: string,
    ): Promise<PortalSmartsListResponseDto> {
        return this.portalSmartService.listRowsByDomain(domain);
    }

    @ApiOperation({
        summary:
            'Портал со смартами, категориями и полями (агрегат для админки / отладки)',
    })
    @ApiParam({ name: 'domain' })
    @Get('by-domain/:domain/enriched')
    async enrichedByDomain(@Param('domain') domain: string) {
        return this.portalSmartService.getSmartsByPortalDomain(domain);
    }

    @ApiOperation({ summary: 'Одна строка смарта по домену + type + group' })
    @ApiParam({ name: 'domain' })
    @ApiParam({ name: 'type' })
    @ApiParam({ name: 'group' })
    @ApiOkResponse({ type: PortalSmartRowResponseDto })
    @Get('by-domain/:domain/type/:type/group/:group')
    async getByDomainAndKeys(
        @Param('domain') domain: string,
        @Param('type') type: string,
        @Param('group') group: string,
    ): Promise<PortalSmartRowResponseDto> {
        return this.portalSmartService.findRowByDomainAndKeys(
            domain,
            type,
            group,
        );
    }

    @ApiOperation({ summary: 'Смарт по numeric id (строка в БД)' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalSmartRowResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalSmartRowResponseDto> {
        return this.portalSmartService.findRowById(BigInt(id));
    }

    @ApiOperation({ summary: 'Создать строку смарта' })
    @ApiCreatedResponse({ type: PortalSmartRowResponseDto })
    @Post()
    async create(
        @Body() dto: CreatePortalSmartDto,
    ): Promise<PortalSmartRowResponseDto> {
        return this.portalSmartService.createRow(dto);
    }

    @ApiOperation({ summary: 'Обновить строку смарта' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalSmartRowResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalSmartDto,
    ): Promise<PortalSmartRowResponseDto> {
        return this.portalSmartService.updateRow(BigInt(id), dto);
    }

    @ApiOperation({
        summary:
            'Удалить только строку смарта (поля/категории в других таблицах не трогаем)',
    })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async deleteRow(@Param('id', ParseIntPipe) id: number) {
        return this.portalSmartService.deleteRowById(BigInt(id));
    }
}
