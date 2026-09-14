import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { WordTemplate } from '@app/konstructor/modules/offer-template/word';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { IResultDocumentLink } from '../../interface/document.interface';

/**
 * Запрос генерации КП v2 — «мультивариантность».
 *
 * Наследует старый payload целиком: поля сделки (шаблон, получатель,
 * менеджер, счета) читаются из него, а «про комплект» приходит участниками
 * в `variants`. Старая ручка `generate` этим DTO не пользуется — по просьбе
 * заказчика старый путь генерации не меняется, живут две версии.
 */
export class OfferWordMultiGenerateDto extends OfferWordByTemplateGenerateDto {
    @ApiProperty({
        required: false,
        type: ComplectCompositionDto,
        description:
            'Настройки сборки комплекта: режим (compare / multi_contract / single_contract) и настройки КП. Без них несколько участников печатаются как compare',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ComplectCompositionDto)
    composition?: ComplectCompositionDto;

    @ApiProperty({
        type: [DocumentVariantDto],
        description:
            'Участники документа — варианты комплекта, по одному payload на каждый. Пустой список или один участник — документ печатается как раньше из полей запроса',
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentVariantDto)
    variants: DocumentVariantDto[];
}

/** Ссылка на готовый документ в ответе. */
export class OfferWordMultiDocumentLinkDto implements IResultDocumentLink {
    @ApiProperty({ description: 'Ссылка на документ (Bitrix Disk или сервер)' })
    @IsString()
    link: string;

    @ApiProperty({ description: 'Отображаемое имя документа' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Тип документа', enum: ['offer', 'invoice'] })
    @IsString()
    type: 'offer' | 'invoice';
}

/** Результат синхронной генерации (withoutQueue). */
export class OfferWordMultiGenerateResultDto {
    @ApiProperty({ description: 'Шаблон КП', type: WordTemplate })
    @ValidateNested()
    @Type(() => WordTemplate)
    template: WordTemplate;

    @ApiProperty({
        description: 'Главный документ КП (первый или склеенный PDF)',
        type: OfferWordMultiDocumentLinkDto,
    })
    @ValidateNested()
    @Type(() => OfferWordMultiDocumentLinkDto)
    link: OfferWordMultiDocumentLinkDto;

    @ApiProperty({
        description:
            'Все документы КП: один, либо по документу на участника (Word или separateDocuments)',
        type: [OfferWordMultiDocumentLinkDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferWordMultiDocumentLinkDto)
    links: OfferWordMultiDocumentLinkDto[];

    @ApiProperty({
        description:
            'Счета — по одному на группу участников с одним типом договора',
        type: [OfferWordMultiDocumentLinkDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferWordMultiDocumentLinkDto)
    invoiceLinks: OfferWordMultiDocumentLinkDto[];

    @ApiProperty({ description: 'Данные рендера шаблона', type: Object })
    renderData: unknown;

    @ApiProperty({
        description: 'Папка сделки на Bitrix Disk, 0 — не создана',
        type: Number,
    })
    @IsInt()
    portalFolderId: number;

    @ApiProperty({
        description:
            'Что не сошлось при слиянии участников (сроки, скидки) — для показа менеджеру',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/**
 * Ответ ручки generate-multi: по умолчанию джоба уходит в очередь и
 * возвращается только operationId; при withoutQueue — сразу результат.
 */
export class OfferWordMultiGenerateResponseDto {
    @ApiProperty({
        description:
            'Идентификатор операции в очереди; null — генерация прошла синхронно',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    operationId: string | null;

    @ApiProperty({
        description: 'Результат синхронной генерации; null — джоба в очереди',
        type: OfferWordMultiGenerateResultDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => OfferWordMultiGenerateResultDto)
    result: OfferWordMultiGenerateResultDto | null;
}
