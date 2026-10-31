import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { OfferPdfGenerateDto } from '../dto/offer-pdf-generate.dto';
import {
    OfferPdfGenerateResponseDto,
    OfferPdfTemplateItemDto,
} from '../dto/offer-pdf-response.dto';
import { OfferPdfGenerateService } from '../services/offer-pdf-generate.service';
import { listOfferPdfTemplates } from '../templates/offer-pdf-template.registry';

/**
 * КП в PDF из встроенных JSX-шаблонов — альтернатива генерации по
 * Word-шаблону (offer-word): без LibreOffice/Gotenberg, с теми же данными.
 */
@ApiTags('Konstructor')
@Controller('offer-pdf')
export class OfferPdfController {
    constructor(private readonly generateService: OfferPdfGenerateService) {}

    @ApiOperation({
        summary: 'Список PDF-шаблонов КП',
        description:
            'Встроенные шаблоны (код, название, описание) для выбора в конструкторе.',
    })
    @ApiOkResponse({ type: [OfferPdfTemplateItemDto] })
    @Get('templates')
    listTemplates(): OfferPdfTemplateItemDto[] {
        return listOfferPdfTemplates();
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
