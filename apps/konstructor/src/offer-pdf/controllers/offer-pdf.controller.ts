import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseEnumPipe,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProduces,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import {
    OfferPdfGenerateResponseDto,
    OfferPdfTemplateItemDto,
} from '../dto/offer-pdf-response.dto';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfGenerateService } from '../services/offer-pdf-generate.service';
import { OfferPdfStylePreviewService } from '../services/offer-pdf-style-preview.service';
import { listOfferPdfTemplates } from '../templates/offer-pdf-template.registry';

/**
 * КП в PDF из встроенных JSX-шаблонов — альтернатива генерации по
 * Word-шаблону (offer-word): без LibreOffice/Gotenberg, с теми же данными.
 */
@ApiTags('Konstructor')
@Controller('offer-pdf')
export class OfferPdfController {
    constructor(
        private readonly generateService: OfferPdfGenerateService,
        private readonly stylePreviewService: OfferPdfStylePreviewService,
    ) {}

    @ApiOperation({
        summary: 'Список PDF-шаблонов КП',
        description:
            'Встроенные стили: код, название, описание, есть ли титульник, гаммы и какие настройки стиль задаёт сам.',
    })
    @ApiOkResponse({ type: [OfferPdfTemplateItemDto] })
    @Get('templates')
    listTemplates(): OfferPdfTemplateItemDto[] {
        return listOfferPdfTemplates();
    }

    @ApiOperation({
        summary: 'Превью PDF-стиля КП',
        description:
            'Первая страница стиля (титульник или первый лист) на образце «Гарант-Офис» — миниатюра для выбора стиля. Данные вымышленные.',
    })
    // параметр с пайпом-экземпляром Swagger сам не описал — без него orval не генерирует клиент
    @ApiParam({
        name: 'code',
        enum: OfferPdfTemplateCode,
        enumName: 'OfferPdfTemplateCode',
        description: 'Код стиля',
    })
    @ApiQuery({
        name: 'palette',
        required: false,
        type: String,
        description:
            'Код гаммы (palettes в списке стилей); не задан или неизвестен — первая гамма',
    })
    @ApiProduces('application/pdf')
    @ApiResponse({
        status: 200,
        description: 'PDF из одной страницы',
        schema: { type: 'string', format: 'binary' },
    })
    @Get('templates/:code/preview')
    async stylePreview(
        @Param('code', new ParseEnumPipe(OfferPdfTemplateCode))
        code: OfferPdfTemplateCode,
        @Res() res: Response,
        @Query('palette') palette?: string,
    ): Promise<void> {
        const preview = await this.stylePreviewService.preview(code, palette);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="offer-style-${code}.pdf"`,
        );
        res.setHeader('Content-Length', preview.buffer.length.toString());
        // собрано без картинок или логотипа — браузеру не запоминать: файлы занесут, превью сменится
        res.setHeader(
            'Cache-Control',
            preview.complete ? 'public, max-age=3600' : 'no-store',
        );
        res.end(preview.buffer);
    }

    @ApiOperation({
        summary: 'Предпросмотр КП в PDF',
        description:
            'Собирает документ и отдаёт PDF в ответе, ничего не сохраняя. Для панели предпросмотра в конструкторе.',
    })
    @ApiProduces('application/pdf')
    @ApiResponse({
        status: 200,
        description: 'PDF-файл документа',
        schema: { type: 'string', format: 'binary' },
    })
    @HttpCode(200)
    @Post('preview')
    async preview(
        @Body() dto: OfferPdfGenerateDto,
        @Res() res: Response,
    ): Promise<void> {
        const rendered = await this.generateService.preview(dto);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            'inline; filename="offer-preview.pdf"',
        );
        res.setHeader('Content-Length', rendered.buffer.length.toString());
        res.setHeader('X-Render-Duration-Ms', rendered.durationMs.toString());
        res.end(rendered.buffer);
    }

    @ApiOperation({
        summary: 'Сформировать КП в PDF',
        description:
            'Сохраняет PDF в хранилище и возвращает публичную ссылку на файл.',
    })
    @ApiOkResponse({ type: OfferPdfGenerateResponseDto })
    @HttpCode(200)
    @Post('generate')
    generate(
        @Body() dto: OfferPdfGenerateDto,
    ): Promise<OfferPdfGenerateResponseDto> {
        return this.generateService.generate(dto);
    }
}
