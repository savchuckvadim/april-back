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
import { OfferTemplatePageStickerService } from '../services/offer-template-page-sticker.service';
import { CreateOfferTemplatePageStickerDto } from '../dtos/create-offer-template-page-sticker.dto';
import { OfferTemplatePageSticker } from '../entities/offer-template-page-sticker.entity';
import { OfferTemplatePageStickerIdParamsDto } from '../dtos/offer-template-page-sticker-params.dto';
import { ReorderStickersDto } from '../dtos/reorder-stickers.dto';

@Controller('offer-template-page-stickers')
export class OfferTemplatePageStickerController {
    constructor(
        private readonly offerTemplatePageStickerService: OfferTemplatePageStickerService,
    ) { }

    @Post()
    async create(
        @Body()
        createOfferTemplatePageStickerDto: CreateOfferTemplatePageStickerDto,
    ): Promise<OfferTemplatePageSticker> {
        return this.offerTemplatePageStickerService.create(
            createOfferTemplatePageStickerDto,
        );
    }

    // @Get()
    // async findAll(
    //     @Query('offer_template_page_id') offer_template_page_id?: string,
    // ): Promise<OfferTemplatePageSticker[]> {
    //     const filters: any = {};

    //     if (offer_template_page_id)
    //         filters.offer_template_page_id = BigInt(offer_template_page_id);

    //     return this.offerTemplatePageStickerService.findMany(filters);
    // }

    // @Get('page/:page_id')
    // async findByPage(
    //     @Param('page_id', ParseIntPipe) page_id: number,
    // ): Promise<OfferTemplatePageSticker[]> {
    //     return this.offerTemplatePageStickerService.findByPage(BigInt(page_id));
    // }

    // @Get('page/:page_id/ordered')
    // async findByPageOrdered(
    //     @Param('page_id', ParseIntPipe) page_id: number,
    // ): Promise<OfferTemplatePageSticker[]> {
    //     return this.offerTemplatePageStickerService.findByPageOrdered(
    //         BigInt(page_id),
    //     );
    // }

    // @Get(':id')
    // async findOne(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<OfferTemplatePageSticker> {
    //     return this.offerTemplatePageStickerService.findById(BigInt(id));
    // }

    // @Get(':id/full')
    // async findOneWithRelations(
    //     @Param('id', ParseIntPipe) id: number,
    // ): Promise<OfferTemplatePageSticker> {
    //     return this.offerTemplatePageStickerService.findWithRelations(
    //         BigInt(id),
    //     );
    // }

    // @Patch(':id')
    // async update(
    //     @Param('id', ParseIntPipe) id: number,
    //     @Body()
    //     updateOfferTemplatePageStickerDto: UpdateOfferTemplatePageStickerDto,
    // ): Promise<OfferTemplatePageSticker> {
    //     return this.offerTemplatePageStickerService.update(
    //         BigInt(id),
    //         updateOfferTemplatePageStickerDto,
    //     );
    // }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: OfferTemplatePageStickerIdParamsDto): Promise<void> {
        return this.offerTemplatePageStickerService.delete(BigInt(params.id));
    }

    @Post('reorder')
    async reorderStickers(
        @Body() reorderData: ReorderStickersDto,
    ): Promise<OfferTemplatePageSticker[]> {
        return this.offerTemplatePageStickerService.reorderStickers(
            BigInt(reorderData.page_id),
            reorderData.sticker_orders.map(so => ({
                id: BigInt(so.id),
                order: so.order,
            })),
        );
    }
}
