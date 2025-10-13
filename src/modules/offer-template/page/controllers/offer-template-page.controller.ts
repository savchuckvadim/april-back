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
import { OfferTemplatePageService } from '../services/offer-template-page.service';

import { OfferTemplatePage } from '../entities/offer-template-page.entity';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OfferTemplatePageQueryDto } from '../dtos/find-all-offer-template-page.dto';
import {
    OfferTemplatePageIdParamsDto,
    OfferTemplatePageTemplateIdParamsDto
} from '../dtos/offer-template-page-params.dto';
import { ReorderPagesDto } from '../dtos/reorder-pages.dto';
import { CreateOfferTemplatePageRequestDto, CreateOfferTemplatePageResponseDto } from '../dtos/create-offer-template-page.dto';
import { UpdateOfferTemplatePageRequestDto } from '../dtos/update-offer-template-page.dto';


@ApiTags('Konstructor Offer Template')
@Controller('offer-template-pages')
export class OfferTemplatePageController {
    constructor(
        private readonly offerTemplatePageService: OfferTemplatePageService,
    ) { }

    @ApiOperation({ summary: 'Create offer template page', description: 'Create a new offer template page' })
    @Post()
    async createOfferTemplatePage(
        @Body() createOfferTemplatePageDto: CreateOfferTemplatePageRequestDto,
    ): Promise<CreateOfferTemplatePageResponseDto> {
        const result = await this.offerTemplatePageService.create(createOfferTemplatePageDto);
        return new CreateOfferTemplatePageResponseDto(result);
    }

    @ApiOperation({ summary: 'Get all offer template pages', description: 'Get all offer template pages' })
    @Get()
    async findAll(
        @Query() query?: OfferTemplatePageQueryDto,
    ): Promise<OfferTemplatePage[]> {
        const { offer_template_id, type, is_active } = query || {};
        const filters: any = {};

        if (offer_template_id)
            filters.offer_template_id = BigInt(offer_template_id);
        if (type) filters.type = type;
        if (is_active !== undefined) filters.is_active = is_active === true;

        return this.offerTemplatePageService.findMany(filters);
    }

    @ApiOperation({ summary: 'Get offer template pages by template', description: 'Get offer template pages by template' })
    @Get('template/:template_id')
    async findByTemplate(
        @Param() params: OfferTemplatePageTemplateIdParamsDto,
    ): Promise<OfferTemplatePage[]> {
        return this.offerTemplatePageService.findByTemplate(
            BigInt(params.template_id),
        );
    }

    @ApiOperation({ summary: 'Get offer template pages by template with blocks', description: 'Get offer template pages by template with blocks' })
    @Get('template/:template_id/with-blocks')
    async findByTemplateWithBlocks(
        @Param() params: OfferTemplatePageTemplateIdParamsDto,
    ): Promise<OfferTemplatePage[]> {
        return this.offerTemplatePageService.findByTemplateWithBlocks(
            BigInt(params.template_id),
        );
    }

    @ApiOperation({ summary: 'Get offer template page by id', description: 'Get offer template page by id' })
    @Get(':id')
    async findOne(
        @Param() params: OfferTemplatePageIdParamsDto,
    ): Promise<OfferTemplatePage> {
        return this.offerTemplatePageService.findById(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Get offer template page by id with relations', description: 'Get offer template page by id with relations' })
    @Get(':id/full')
    async findOneWithRelations(
        @Param() params: OfferTemplatePageIdParamsDto,
    ): Promise<OfferTemplatePage> {
        return this.offerTemplatePageService.findWithRelations(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Update offer template page', description: 'Update offer template page' })
    @Patch(':id')
    async update(
        @Param() params: OfferTemplatePageIdParamsDto,
        @Body() updateOfferTemplatePageDto: UpdateOfferTemplatePageRequestDto,
    ): Promise<OfferTemplatePage> {
        return this.offerTemplatePageService.update(
            BigInt(params.id),
            updateOfferTemplatePageDto,
        );
    }

    @ApiOperation({ summary: 'Delete offer template page', description: 'Delete offer template page' })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplatePageIdParamsDto): Promise<void> {
        return this.offerTemplatePageService.delete(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Set active offer template page', description: 'Set active offer template page' })
    @Patch(':id/active')
    async setActivePage(
        @Param() params: OfferTemplatePageIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<OfferTemplatePage> {
        return this.offerTemplatePageService.setActive(BigInt(params.id), is_active);
    }

    @ApiOperation({ summary: 'Reorder offer template pages', description: 'Reorder offer template pages' })
    @Post('reorder')
    async reorderPages(
        @Body() reorderData: ReorderPagesDto,
    ): Promise<OfferTemplatePage[]> {
        return this.offerTemplatePageService.reorderPages(
            BigInt(reorderData.template_id),
            reorderData.page_orders.map(po => ({
                id: BigInt(po.id),
                order: po.order,
            })),
        );
    }
}
