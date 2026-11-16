import { ApiProperty } from '@nestjs/swagger';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfSettingsDto } from './offer-pdf-generate.dto';
import { OfferPdfGenerateResult } from '../services/offer-pdf-generate.service';
import { OfferPdfTemplateInfo } from '../templates/offer-pdf-template.interface';
import { OfferPdfPaletteInfo } from '../templates/kit/theme/offer-pdf-palette';

export class OfferPdfPaletteItemDto implements OfferPdfPaletteInfo {
    @ApiProperty({
        description: 'Код гаммы — передаётся в preview/generate как palette.',
        example: 'garant',
    })
    code: string;

    @ApiProperty({
        description: 'Название гаммы для выбора.',
        example: 'Синий Гаранта',
    })
    name: string;

    @ApiProperty({ description: 'Цвет кружка в выборе.', example: '#1F4E9C' })
    swatch: string;
}

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

    @ApiProperty({
        description:
            'Есть ли у стиля титульный лист: только у таких стилей работает настройка withCover.',
        example: false,
    })
    hasCover: boolean;

    @ApiProperty({
        description:
            'Есть ли у стиля промо-страница (о системе, о сервисе): только у таких стилей работает настройка withPromo.',
        example: false,
    })
    hasPromo: boolean;

    @ApiProperty({
        description:
            'Настройки, которые стиль задаёт сам: в конструкторе их переключатели неактивны, при генерации они ставятся поверх выбора менеджера.',
        type: () => OfferPdfSettingsDto,
    })
    lockedSettings: OfferPdfSettingsDto;

    @ApiProperty({
        description:
            'Гаммы стиля; первая — по умолчанию. Пусто — у стиля одна гамма.',
        type: () => [OfferPdfPaletteItemDto],
    })
    palettes: OfferPdfPaletteItemDto[];
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

    @ApiProperty({
        description:
            'Файл загружен на Диск Битрикса и упомянут в таймлайне сделки.',
        type: Boolean,
        example: true,
    })
    savedToDeal: boolean;

    @ApiProperty({
        description: 'Ссылка на файл в Битриксе; пусто — загрузка не удалась.',
        type: String,
        nullable: true,
        example: 'https://portal.bitrix24.ru/disk/file/42',
    })
    bitrixLink: string | null;

    @ApiProperty({
        description:
            'Почему файл не прикреплён к сделке; пусто — прикреплён или не запрашивалось.',
        type: String,
        nullable: true,
        example: 'Не удалось прикрепить файл к сделке: нет доступа к Диску',
    })
    dealMessage: string | null;
}
