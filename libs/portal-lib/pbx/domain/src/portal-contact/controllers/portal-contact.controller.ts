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
import { PortalContactService } from '../services/portal-contact.service';
import { CreatePortalContactDto } from '../dto/create-portal-contact.dto';
import { UpdatePortalContactDto } from '../dto/update-portal-contact.dto';
import { PortalContactResponseDto } from '../dto/portal-contact-response.dto';
import { PortalContactWithFieldsResponseDto } from '../dto/portal-contact-with-fields-response.dto';

@ApiTags('PBX Portal Contact (DB)')
@Controller('pbx/portal-contact')
export class PortalContactController {
    constructor(private readonly portalContactService: PortalContactService) {}

    @ApiOperation({ summary: 'Список всех контактов порталов' })
    @ApiOkResponse({ type: [PortalContactResponseDto] })
    @Get()
    async list(): Promise<PortalContactResponseDto[]> {
        return this.portalContactService.findMany();
    }

    @ApiOperation({
        summary:
            'Контакт по portalId (не больше одного на портал по правилам сервиса)',
    })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalContactResponseDto })
    @ApiNotFoundResponse({ description: 'Контакт не найден' })
    @Get('by-portal/:portalId')
    async getByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalContactResponseDto> {
        const row = await this.portalContactService.findByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Контакт для портала ${portalId} не найден`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Контакт + поля по portalId' })
    @ApiParam({ name: 'portalId' })
    @ApiOkResponse({ type: PortalContactWithFieldsResponseDto })
    @ApiNotFoundResponse()
    @Get('by-portal/:portalId/enriched')
    async enrichedByPortalId(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<PortalContactWithFieldsResponseDto> {
        const row =
            await this.portalContactService.findWithFieldsByPortalId(portalId);
        if (!row) {
            throw new NotFoundException(
                `Контакт для портала ${portalId} не найден`,
            );
        }
        return row;
    }

    @ApiOperation({ summary: 'Контакт + поля по id строки btx_contacts' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalContactWithFieldsResponseDto })
    @Get(':id/enriched')
    async enrichedById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalContactWithFieldsResponseDto> {
        return this.portalContactService.findWithFieldsByContactId(id);
    }

    @ApiOperation({ summary: 'Один контакт по id' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalContactResponseDto })
    @Get(':id')
    async getById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalContactResponseDto> {
        return this.portalContactService.findById(id);
    }

    @ApiOperation({ summary: 'Создать контакт портала' })
    @ApiCreatedResponse({ type: PortalContactResponseDto })
    @Post()
    async create(
        @Body() dto: CreatePortalContactDto,
    ): Promise<PortalContactResponseDto> {
        return this.portalContactService.create(dto);
    }

    @ApiOperation({ summary: 'Обновить контакт' })
    @ApiParam({ name: 'id' })
    @ApiOkResponse({ type: PortalContactResponseDto })
    @Patch(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdatePortalContactDto,
    ): Promise<PortalContactResponseDto> {
        return this.portalContactService.update(id, dto);
    }

    @ApiOperation({
        summary: 'Удалить контакт и все привязанные PBX-поля (BTX_CONTACT)',
    })
    @ApiParam({ name: 'id' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.portalContactService.delete(id);
    }
}
