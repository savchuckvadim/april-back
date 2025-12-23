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
    BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OfferTemplateService } from '../services/offer-template.service';
import { UpdateOfferTemplateDto } from '../dtos/update-offer-template.dto';
import {
    OfferTemplate,
    OfferTemplateSummary,
} from '../entities/offer-template.entity';
import { OfferTemplateQueryDto } from '../dtos/find-all-offer-template.dto';
import {
    OfferTemplateIdParamsDto,
    OfferTemplatePortalIdParamsDto,
    OfferTemplateUserPortalParamsDto
} from '../dtos/offer-template-params.dto';
import { OfferTemplateDto, OfferTemplateSummaryDto } from '../dtos/offer-template.dto';
import { templateResponseMap } from '../lib/offer-template.mapper';
import { CreateOfferTemplateRequestDto, CreateOfferTemplateResponseDto, OfferTemplateVisibility } from '../dtos/create-offer-template.dto';
import { randomUUID } from 'crypto';


@ApiTags('Konstructor Offer Template')
@Controller('offer-templates')
export class OfferTemplateController {
    constructor(
        private readonly offerTemplateService: OfferTemplateService

    ) { }


    @ApiOperation({ summary: 'Create offer template', description: 'Create a new offer template', })
    @ApiResponse({ status: 200, description: 'Create offer template', type: CreateOfferTemplateResponseDto })
    @Post()
    async createOfferTemplate(
        @Body() createOfferTemplateDto: CreateOfferTemplateRequestDto,
    ): Promise<CreateOfferTemplateResponseDto> {

        const uuid = randomUUID();

        const code = createOfferTemplateDto.code || `offer-${uuid}`;

 
        const data = {
            ...createOfferTemplateDto,
            code: code,
        }
        const result = await this.offerTemplateService.create(data);

        const templte = {
            ...result,

            visibility: result.visibility as OfferTemplateVisibility,
        } as CreateOfferTemplateResponseDto;
        return templte;
    }

    @ApiOperation({ summary: 'Get all offer template summaries', description: 'Get all offer template summaries' })
    @ApiResponse({ status: 200, description: 'Get all offer template summaries', type: [OfferTemplateSummaryDto] })
    @Get()
    async findAllOfferTemplate(
        @Query() query?: OfferTemplateQueryDto,

    ): Promise<OfferTemplateSummaryDto[]> {

        try {
            const filters: any = {};
            const { visibility, portal_id, is_active, search } = query || {};
            if (visibility) filters.visibility = visibility;
            if (portal_id) filters.portal_id = BigInt(portal_id);
            if (is_active !== undefined) filters.is_active = is_active === true;
            if (search) filters.search = search;


            const templates = await this.offerTemplateService.findMany();

            const result = templateResponseMap(templates);
            return result;
        } catch (error) {
            console.error(error);
            console.error(error);
            throw new BadRequestException(error);
        }
    }

    @Get('public')
    async findPublic(): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateService.findPublic();
    }

    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: OfferTemplatePortalIdParamsDto,
    ): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateService.findByPortal(BigInt(params.portal_id));
    }

    @Get('user/:user_id/portal/:portal_id')
    async findUserTemplates(
        @Param() params: OfferTemplateUserPortalParamsDto,
    ): Promise<OfferTemplateSummary[]> {
        return this.offerTemplateService.findUserTemplates(
            BigInt(params.user_id),
            BigInt(params.portal_id),
        );
    }

    @ApiOperation({ summary: 'Get offer template by id', description: 'Get offer template by id' })
    @ApiResponse({ status: 200, description: 'Get offer template by id', type: OfferTemplateDto })
    @Get(':id')
    async findOne(
        @Param() params: OfferTemplateIdParamsDto,
    ): Promise<OfferTemplateDto> {
        const template = await this.offerTemplateService.findById(BigInt(params.id));
        const result = new OfferTemplateDto(template);
        return result;

    }

    @Get(':id/full')
    async findOneWithRelations(
        @Param() params: OfferTemplateIdParamsDto,
    ): Promise<OfferTemplate> {
        return this.offerTemplateService.findByIdWithRelations(BigInt(params.id));
    }

    @Patch(':id')
    async update(
        @Param() params: OfferTemplateIdParamsDto,
        @Body() updateOfferTemplateDto: UpdateOfferTemplateDto,
    ): Promise<OfferTemplate> {
        return this.offerTemplateService.update(
            BigInt(params.id),
            updateOfferTemplateDto,
        );
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplateIdParamsDto): Promise<void> {
        return this.offerTemplateService.delete(BigInt(params.id));
    }

    @Post(':id/increment-counter')
    async incrementCounter(
        @Param() params: OfferTemplateIdParamsDto,
    ): Promise<OfferTemplate> {
        return this.offerTemplateService.incrementCounter(BigInt(params.id));
    }

    @Patch(':id/active')
    async setActiveOfferTemplate(
        @Param() params: OfferTemplateIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<OfferTemplate> {
        return this.offerTemplateService.setActive(BigInt(params.id), is_active);
    }

    @Patch(':id/default')
    async setDefault(
        @Param() params: OfferTemplateIdParamsDto,
        @Body('is_default') is_default: boolean,
    ): Promise<OfferTemplate> {
        return this.offerTemplateService.setDefault(BigInt(params.id), is_default);
    }
}
