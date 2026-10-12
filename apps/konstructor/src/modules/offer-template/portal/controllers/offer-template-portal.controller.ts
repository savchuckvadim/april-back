import {
    Controller,
    Post,
    Get,
    Body,
    Patch,
    Param,
    Delete,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferTemplatePortalService } from '../services/offer-template-portal.service';
import { CreateOfferTemplatePortalDto } from '../dtos/create-offer-template-portal.dto';
import { OfferTemplatePortalIdParamsDto } from '../dtos/offer-template-portal-params.dto';
import {
    OfferTemplatePortalPortalParamsDto,
    OfferTemplatePortalResponseDto,
    OfferTemplatePortalTemplateParamsDto,
} from '../dtos/offer-template-portal-response.dto';

/**
 * Привязки шаблонов КП к порталам (join-таблица offer_template_portal).
 *
 * У offer_templates НЕТ колонки portal_id — портальная область шаблона
 * живёт только здесь. Поэтому без read-роутов этого контроллера админка
 * не могла ни показать, к каким порталам привязан шаблон, ни построить
 * список шаблонов портала: раньше все GET были закомментированы, оставались
 * только создание/удаление/флаги.
 */
@ApiTags('Offer template portals')
@Controller('offer-template-portals')
export class OfferTemplatePortalController {
    constructor(
        private readonly offerTemplatePortalService: OfferTemplatePortalService,
    ) {}

    @ApiOperation({ summary: 'Создать привязку шаблона к порталу' })
    @ApiResponse({ status: 201, type: OfferTemplatePortalResponseDto })
    @Post()
    async createOfferTemplatePortal(
        @Body() createOfferTemplatePortalDto: CreateOfferTemplatePortalDto,
    ): Promise<OfferTemplatePortalResponseDto> {
        const created = await this.offerTemplatePortalService.create(
            createOfferTemplatePortalDto,
        );
        return OfferTemplatePortalResponseDto.fromEntity(created);
    }

    @ApiOperation({
        summary: 'Привязки шаблона: к каким порталам он подключён',
        description:
            'Нужно админке, чтобы показать и отредактировать список порталов ' +
            'шаблона (мультиселект). Пусто — шаблон-сирота, его не видит ни один портал.',
    })
    @ApiResponse({ status: 200, type: [OfferTemplatePortalResponseDto] })
    @Get('template/:template_id')
    async findByTemplate(
        @Param() params: OfferTemplatePortalTemplateParamsDto,
    ): Promise<OfferTemplatePortalResponseDto[]> {
        const rows = await this.offerTemplatePortalService.findByTemplate(
            BigInt(params.template_id),
        );
        return rows.map(row => OfferTemplatePortalResponseDto.fromEntity(row));
    }

    @ApiOperation({
        summary: 'Привязки портала: какие шаблоны к нему подключены',
    })
    @ApiResponse({ status: 200, type: [OfferTemplatePortalResponseDto] })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: OfferTemplatePortalPortalParamsDto,
    ): Promise<OfferTemplatePortalResponseDto[]> {
        const rows = await this.offerTemplatePortalService.findByPortal(
            BigInt(params.portal_id),
        );
        return rows.map(row => OfferTemplatePortalResponseDto.fromEntity(row));
    }

    @ApiOperation({ summary: 'Удалить привязку' })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(
        @Param() params: OfferTemplatePortalIdParamsDto,
    ): Promise<void> {
        return this.offerTemplatePortalService.delete(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Включить/выключить привязку' })
    @ApiResponse({ status: 200, type: OfferTemplatePortalResponseDto })
    @Patch(':id/active')
    async setActiveTemplatePortal(
        @Param() params: OfferTemplatePortalIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<OfferTemplatePortalResponseDto> {
        const row = await this.offerTemplatePortalService.setActive(
            BigInt(params.id),
            is_active,
        );
        return OfferTemplatePortalResponseDto.fromEntity(row);
    }

    @ApiOperation({ summary: 'Сделать привязку шаблоном по умолчанию портала' })
    @ApiResponse({ status: 200, type: OfferTemplatePortalResponseDto })
    @Patch(':id/default')
    async setDefault(
        @Param() params: OfferTemplatePortalIdParamsDto,
        @Body('is_default') is_default: boolean,
    ): Promise<OfferTemplatePortalResponseDto> {
        const row = await this.offerTemplatePortalService.setDefault(
            BigInt(params.id),
            is_default,
        );
        return OfferTemplatePortalResponseDto.fromEntity(row);
    }
}
