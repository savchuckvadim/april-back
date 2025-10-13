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
import { OfferTemplatePageBlockService } from '../services/offer-template-page-block.service';
import { CreateOfferTemplatePageBlockDto } from '../dtos/create-offer-template-page-block.dto';
import { UpdateOfferTemplatePageBlockDto } from '../dtos/update-offer-template-page-block.dto';
import { OfferTemplatePageBlock } from '../entities/offer-template-page-block.entity';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OfferTemplatePageBlockIdParamsDto } from '../dtos/offer-template-page-block-params.dto';
import { ReorderBlocksDto } from '../dtos/reorder-blocks.dto';


@ApiTags('Konstructor Offer Template')
@Controller('offer-template-page-blocks')
export class OfferTemplatePageBlockController {
    constructor(
        private readonly offerTemplatePageBlockService: OfferTemplatePageBlockService,
    ) { }

    @ApiOperation({ summary: 'Create offer template page block', description: 'Create a new offer template page block' })
    @Post()
    async create(
        @Body()
        createOfferTemplatePageBlockDto: CreateOfferTemplatePageBlockDto,
    ): Promise<OfferTemplatePageBlock> {
        return this.offerTemplatePageBlockService.create(
            createOfferTemplatePageBlockDto,
        );
    }

    // @ApiOperation({ summary: 'Get all offer template page blocks', description: 'Get all offer template page blocks' })
    // @Get()
    // async findAll(
    //     @Query('offer_template_page_id') offer_template_page_id?: string,
    //     @Query('type')
    //     type?:
    //         | 'background'
    //         | 'about'
    //         | 'hero'
    //         | 'letter'
    //         | 'documentNumber'
    //         | 'manager'
    //         | 'logo'
    //         | 'stamp'
    //         | 'header'
    //         | 'footer'
    //         | 'infoblocks'
    //         | 'price'
    //         | 'slogan'
    //         | 'infoblocksDescription'
    //         | 'lt'
    //         | 'otherComplects'
    //         | 'comparison'
    //         | 'comparisonComplects'
    //         | 'comparisonIblocks'
    //         | 'user'
    //         | 'default',
    // ): Promise<OfferTemplatePageBlock[]> {
    //     const filters: any = {};

    //     if (offer_template_page_id)
    //         filters.offer_template_page_id = BigInt(offer_template_page_id);
    //     if (type) filters.type = type;

    //     return this.offerTemplatePageBlockService.findMany(filters);
    // }

    // @ApiOperation({ summary: 'Get offer template page blocks by page', description: 'Get offer template page blocks by page' })
    // @Get('page/:page_id')
    // async findByPage(
    //     @Param('page_id', ParseIntPipe) page_id: number,
    // ): Promise<OfferTemplatePageBlock[]> {
    //     return this.offerTemplatePageBlockService.findByPage(BigInt(page_id));
    // }

    // @ApiOperation({ summary: 'Get offer template page blocks by page ordered', description: 'Get offer template page blocks by page ordered' })
    // @Get('page/:page_id/ordered')
    // async findByPageOrdered(
    //     @Param('page_id', ParseIntPipe) page_id: number,
    // ): Promise<OfferTemplatePageBlock[]> {
    //     return this.offerTemplatePageBlockService.findByPageOrdered(
    //         BigInt(page_id),
    //     );
    // }

    // @ApiOperation({ summary: 'Get offer template page blocks by type', description: 'Get offer template page blocks by type' })
    // @Get('type/:type')
    // async findByType(
    //     @Param('type')
    //     type:
    //         | 'background'
    //         | 'about'
    //         | 'hero'
    //         | 'letter'
    //         | 'documentNumber'
    //         | 'manager'
    //         | 'logo'
    //         | 'stamp'
    //         | 'header'
    //         | 'footer'
    //         | 'infoblocks'
    //         | 'price'
    //         | 'slogan'
    //         | 'infoblocksDescription'
    //         | 'lt'
    //         | 'otherComplects'
    //         | 'comparison'
    //         | 'comparisonComplects'
    //         | 'comparisonIblocks'
    //         | 'user'
    //         | 'default',
    // ): Promise<OfferTemplatePageBlock[]> {
    //     return this.offerTemplatePageBlockService.findByType(type);
    // }

    @ApiOperation({ summary: 'Get offer template page block by id', description: 'Get offer template page block by id' })
    @Get(':id')
    async findOne(
        @Param() params: OfferTemplatePageBlockIdParamsDto,
    ): Promise<OfferTemplatePageBlock> {
        return this.offerTemplatePageBlockService.findById(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Get offer template page block by id with relations', description: 'Get offer template page block by id with relations' })
    @Get(':id/full')
    async findOneWithRelations(
        @Param() params: OfferTemplatePageBlockIdParamsDto,
    ): Promise<OfferTemplatePageBlock> {
        return this.offerTemplatePageBlockService.findWithRelations(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Update offer template page block', description: 'Update offer template page block' })
    @Patch(':id')
    async update(
        @Param() params: OfferTemplatePageBlockIdParamsDto,
        @Body()
        updateOfferTemplatePageBlockDto: UpdateOfferTemplatePageBlockDto,
    ): Promise<OfferTemplatePageBlock> {
        return this.offerTemplatePageBlockService.update(
            BigInt(params.id),
            updateOfferTemplatePageBlockDto,
        );
    }

    @ApiOperation({ summary: 'Delete offer template page block', description: 'Delete offer template page block' })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplatePageBlockIdParamsDto): Promise<void> {
        return this.offerTemplatePageBlockService.delete(BigInt(params.id));
    }

    @ApiOperation({ summary: 'Reorder offer template page blocks', description: 'Reorder offer template page blocks' })
    @Post('reorder')
    async reorderBlocks(
        @Body() reorderData: ReorderBlocksDto,
    ): Promise<OfferTemplatePageBlock[]> {
        return this.offerTemplatePageBlockService.reorderBlocks(
            BigInt(reorderData.page_id),
            reorderData.block_orders.map(bo => ({
                id: BigInt(bo.id),
                order: bo.order,
            })),
        );
    }
}
