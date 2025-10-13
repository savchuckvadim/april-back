import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { OfferTemplatePortalService } from '../services/offer-template-portal.service';
import { CreateOfferTemplatePortalDto } from '../dtos/create-offer-template-portal.dto';
import { UpdateOfferTemplatePortalDto } from '../dtos/update-offer-template-portal.dto';
import { OfferTemplatePortal } from '../entities/offer-template-portal.entity';
import { OfferTemplatePortalIdParamsDto } from '../dtos/offer-template-portal-params.dto';

@Controller('offer-template-portals')
export class OfferTemplatePortalController {
    constructor(
        private readonly offerTemplatePortalService: OfferTemplatePortalService,
    ) { }

    @Post()
    async createOfferTemplatePortal(
        @Body() createOfferTemplatePortalDto: CreateOfferTemplatePortalDto,
    ): Promise<OfferTemplatePortal> {
        return this.offerTemplatePortalService.create(
            createOfferTemplatePortalDto,
        );
    }

    // @Get()
    // async findAll(
    //     @Query('offer_template_id') offer_template_id?: string,
    //     @Query('portal_id') portal_id?: string,
    //     @Query('is_active') is_active?: string,
    //     @Query('is_default') is_default?: string,
    // ): Promise<OfferTemplatePortal[]> {
    //     const filters: any = {};

    //     if (offer_template_id)
    //         filters.offer_template_id = BigInt(offer_template_id);
    //     if (portal_id) filters.portal_id = BigInt(portal_id);
    //     if (is_active !== undefined) filters.is_active = is_active === 'true';
    //     if (is_default !== undefined)
    //         filters.is_default = is_default === 'true';

    //     return this.offerTemplatePortalService.findMany(filters);
    // }

    // @Get('portal/:portal_id')
    // async findByPortal(
    //     @Param('portal_id', ParseIntPipe) portal_id: number,
    // ): Promise<OfferTemplatePortal[]> {
    //     return this.offerTemplatePortalService.findByPortal(BigInt(portal_id));
    // }

    // @Get('portal/:portal_id/active')
    // async findActiveByPortal(
    //     @Param('portal_id', ParseIntPipe) portal_id: number,
    // ): Promise<OfferTemplatePortal[]> {
    //     return this.offerTemplatePortalService.findActiveByPortal(
    //         BigInt(portal_id),
    //     );
    // }

    // @Get('template/:template_id')
    // async findByTemplate(
    //     @Param('template_id', ParseIntPipe) template_id: number,
    // ): Promise<OfferTemplatePortal[]> {
    //     return this.offerTemplatePortalService.findByTemplate(
    //         BigInt(template_id),
    //     );
    // }

    // @Get(':id')
    // async findOne(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<OfferTemplatePortal> {
    //     return this.offerTemplatePortalService.findById(BigInt(id));
    // }

    // @Get(':id/full')
    // async findOneWithRelations(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<OfferTemplatePortal> {
    //     return this.offerTemplatePortalService.findWithRelations(BigInt(id));
    // }

    // @Patch(':id')
    // async update(
    //     @Param('id', ParseIntPipe) id: number,
    //     @Body() updateOfferTemplatePortalDto: UpdateOfferTemplatePortalDto,
    // ): Promise<OfferTemplatePortal> {
    //     return this.offerTemplatePortalService.update(
    //         BigInt(id),
    //         updateOfferTemplatePortalDto,
    //     );
    // }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplatePortalIdParamsDto): Promise<void> {
        return this.offerTemplatePortalService.delete(BigInt(params.id));
    }

    @Patch(':id/active')
    async setActiveTemplatePortal(
        @Param() params: OfferTemplatePortalIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<OfferTemplatePortal> {
        return this.offerTemplatePortalService.setActive(BigInt(params.id), is_active);
    }

    @Patch(':id/default')
    async setDefault(
        @Param() params: OfferTemplatePortalIdParamsDto,
        @Body('is_default') is_default: boolean,
    ): Promise<OfferTemplatePortal> {
        return this.offerTemplatePortalService.setDefault(
            BigInt(params.id),
            is_default,
        );
    }
}
