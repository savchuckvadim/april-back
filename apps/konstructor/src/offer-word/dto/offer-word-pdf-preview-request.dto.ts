import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import { OfferWordByTemplateGenerateDto } from './offer-word-generate-request.dto';

/**
 * Запрос превью Word-КП в PDF.
 *
 * Расширяет обычный запрос КП участниками комплекта: превью определяет режим
 * печати той же функцией, что и формирование КП v2 (`generate-multi`), и
 * показывает тот же документ. Запрос без `variants` и `composition` печатается
 * по верхним полям, как раньше.
 */
export class OfferWordPdfPreviewRequestDto extends OfferWordByTemplateGenerateDto {
    @ApiProperty({
        required: false,
        type: ComplectCompositionDto,
        description:
            'Настройки сборки комплекта: режим (compare / multi_contract / single_contract) и настройки КП. Те же, что у формирования КП. Без них несколько участников печатаются как compare',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ComplectCompositionDto)
    composition?: ComplectCompositionDto;

    @ApiProperty({
        required: false,
        type: [DocumentVariantDto],
        description:
            'Участники документа — варианты комплекта, по одному payload на каждый, те же, что у формирования КП. Без поля или с пустым списком превью печатает верхние поля запроса, с одним участником — данные этого участника. Превью всегда отдаёт один PDF-файл, настройка separateDocuments на него не влияет',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentVariantDto)
    variants?: DocumentVariantDto[];
}
