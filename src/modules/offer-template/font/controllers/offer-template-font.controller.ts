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
import { OfferTemplateFontService } from '../services/offer-template-font.service';
import { CreateOfferTemplateFontDto } from '../dtos/create-offer-template-font.dto';
import { UpdateOfferTemplateFontDto } from '../dtos/update-offer-template-font.dto';
import { OfferTemplateFont } from '../entities/offer-template-font.entity';
import { OfferTemplateFontQueryDto } from '../dtos/offer-template-font-request.dto';
import {
    OfferTemplateFontIdParamsDto,
    OfferTemplateFontTemplateIdParamsDto
} from '../dtos/offer-template-font-params.dto';

@Controller('offer-template-fonts')
export class OfferTemplateFontController {
    constructor(
        private readonly offerTemplateFontService: OfferTemplateFontService,
    ) { }

    @Post()
    async create(
        @Body() createOfferTemplateFontDto: CreateOfferTemplateFontDto,
    ): Promise<OfferTemplateFont> {
        return this.offerTemplateFontService.create(createOfferTemplateFontDto);
    }

    @Get()
    async findAllOfferTemplateFont(
        @Query() query: OfferTemplateFontQueryDto,
    ): Promise<OfferTemplateFont[]> {
        const { offer_template_id } = query;
        const filters: any = {};

        if (offer_template_id)
            filters.offer_template_id = BigInt(offer_template_id);

        return this.offerTemplateFontService.findMany(filters);
    }

    @Get('template/:template_id')
    async findByTemplate(
        @Param() params: OfferTemplateFontTemplateIdParamsDto,
    ): Promise<OfferTemplateFont[]> {
        return this.offerTemplateFontService.findByTemplate(
            BigInt(params.template_id),
        );
    }

    @Get(':id')
    async findOne(
        @Param() params: OfferTemplateFontIdParamsDto,
    ): Promise<OfferTemplateFont> {
        return this.offerTemplateFontService.findById(BigInt(params.id));
    }

    @Get(':id/full')
    async findOneWithRelations(
        @Param() params: OfferTemplateFontIdParamsDto,
    ): Promise<OfferTemplateFont> {
        return this.offerTemplateFontService.findWithRelations(BigInt(params.id));
    }

    @Patch(':id')
    async update(
        @Param() params: OfferTemplateFontIdParamsDto,
        @Body() updateOfferTemplateFontDto: UpdateOfferTemplateFontDto,
    ): Promise<OfferTemplateFont> {
        return this.offerTemplateFontService.update(
            BigInt(params.id),
            updateOfferTemplateFontDto,
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplateFontIdParamsDto): Promise<void> {
        return this.offerTemplateFontService.delete(BigInt(params.id));
    }
}
