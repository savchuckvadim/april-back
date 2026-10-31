import { ApiProperty } from '@nestjs/swagger';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfGenerateResult } from '../services/offer-pdf-generate.service';
import { OfferPdfTemplateInfo } from '../templates/offer-pdf-template.interface';

export class OfferPdfTemplateItemDto implements OfferPdfTemplateInfo {
    @ApiProperty({
        description: 'Код шаблона — передаётся в preview/generate.',
        enum: OfferPdfTemplateCode,
        example: OfferPdfTemplateCode.CLASSIC,
    })
    code: OfferPdfTemplateCode;

    @ApiProperty({
        description: 'Название для выбора в конструкторе.',
        type: String,
        example: 'Классический',
    })
    name: string;

    @ApiProperty({
        description: 'Что в шаблоне и чем он отличается.',
        type: String,
        example: 'Письмо, таблица цен, наполнение, подпись и печать.',
    })
    description: string;
}

export class OfferPdfGenerateResponseDto implements OfferPdfGenerateResult {
    @ApiProperty({
        description: 'Публичная ссылка на PDF.',
        type: String,
        example: 'https://app.example.ru/api/files/abc123',
    })
    link: string;

    @ApiProperty({
        description: 'Имя файла в хранилище.',
        type: String,
        example: 'offer-7f3c….pdf',
    })
    fileName: string;

    @ApiProperty({
        description: 'Каким шаблоном собран документ.',
        enum: OfferPdfTemplateCode,
        example: OfferPdfTemplateCode.CLASSIC,
    })
    templateCode: OfferPdfTemplateCode;

    @ApiProperty({
        description: 'Время рендера PDF в миллисекундах.',
        type: Number,
        example: 180,
    })
    durationMs: number;

    @ApiProperty({
        description: 'Размер файла в байтах.',
        type: Number,
        example: 148_233,
    })
    size: number;
}
