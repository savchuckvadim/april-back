import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { OfferWordByTemplateGenerateDto } from '../../offer-word/dto/offer-word-generate-request.dto';
import {
    DocumentFieldDescriptionMode,
    DocumentFieldViewMode,
} from '../../offer/type/offer-settings.type';
import { OfferPdfSettingsInput } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';

/** Настройки документа; любое поле можно не передавать. */
export class OfferPdfSettingsDto implements OfferPdfSettingsInput {
    @ApiPropertyOptional({
        description:
            'Сколько описания наполнения: нет (только названия), мало, средне, много.',
        enum: DocumentFieldDescriptionMode,
        default: DocumentFieldDescriptionMode.SMALL,
    })
    @IsOptional()
    @IsEnum(DocumentFieldDescriptionMode)
    descriptionMode?: DocumentFieldDescriptionMode;

    @ApiPropertyOptional({
        description: 'Вид наполнения: список, таблица, таблица с разделами.',
        enum: DocumentFieldViewMode,
        default: DocumentFieldViewMode.LIST,
    })
    @IsOptional()
    @IsEnum(DocumentFieldViewMode)
    viewMode?: DocumentFieldViewMode;

    @ApiPropertyOptional({
        description: 'Блок подписи руководителя и печати в конце документа.',
        type: Boolean,
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    withStamps?: boolean;

    @ApiPropertyOptional({
        description: 'Контакты менеджера в подвале каждой страницы.',
        type: Boolean,
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    withManager?: boolean;

    @ApiPropertyOptional({
        description: 'Сначала таблица цен, потом наполнение (иначе наоборот).',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    isPriceFirst?: boolean;

    @ApiPropertyOptional({
        description: 'Фраза об акции под таблицей цен.',
        type: String,
        example: 'Скидка действует до конца месяца',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    salePhrase?: string | null;
}

/** Сопроводительное письмо; пустые поля шаблон заполняет сам. */
export class OfferPdfLetterDto {
    @ApiPropertyOptional({
        description: 'Обращение над текстом письма.',
        type: String,
        example: 'Уважаемый Иван Иванович!',
    })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    appeal?: string;

    @ApiPropertyOptional({
        description:
            'Текст письма. Разметка: <color>…</color> — акцент, <bold>…</bold> — жирный, <red>…</red> — красный; абзацы — перевод строки.',
        type: String,
        example:
            'Благодарим за интерес к системе <color>ГАРАНТ</color>.\nНаправляем коммерческое предложение.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(5000)
    text?: string;
}

/**
 * Запрос на КП в PDF: те же данные, что для Word-шаблона (цены, наполнение,
 * реквизиты, получатель, менеджер), без полей Word-шаблона и счёта, плюс
 * код PDF-шаблона, настройки, письмо и номер документа.
 */
export class OfferPdfGenerateDto extends OmitType(
    OfferWordByTemplateGenerateDto,
    [
        'templateId',
        'invoiceTemplateId',
        'invoice',
        'isWord',
        'withoutQueue',
        'onlyBitrixSave',
    ] as const,
) {
    @ApiPropertyOptional({
        description:
            'Код встроенного PDF-шаблона (список — GET /offer-pdf/templates).',
        enum: OfferPdfTemplateCode,
        default: OfferPdfTemplateCode.CLASSIC,
    })
    @IsOptional()
    @IsEnum(OfferPdfTemplateCode)
    templateCode?: OfferPdfTemplateCode;

    @ApiPropertyOptional({
        description: 'Настройки документа.',
        type: OfferPdfSettingsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => OfferPdfSettingsDto)
    settings?: OfferPdfSettingsDto;

    @ApiPropertyOptional({
        description: 'Сопроводительное письмо.',
        type: OfferPdfLetterDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => OfferPdfLetterDto)
    letter?: OfferPdfLetterDto;

    @ApiPropertyOptional({
        description: 'Исходящий номер документа — печатается как «Исх. № …».',
        type: String,
        example: 'КП-1042',
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    documentNumber?: string;
}
