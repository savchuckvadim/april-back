import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import { OfferPdfSettingsDto } from './offer-pdf-generate.dto';
import {
    OfferPdfGeneratedFile,
    OfferPdfGenerateResult,
} from '../services/offer-pdf-generate.service';
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
        enumName: 'OfferPdfTemplateCode',
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

/**
 * Один готовый файл: у КП единственный, склейка вариантов или файл варианта;
 * та же форма у файла счёта.
 */
export class OfferPdfGeneratedFileDto implements OfferPdfGeneratedFile {
    @ApiProperty({
        description: 'Публичная ссылка на PDF на нашем сервере.',
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
        description:
            'Имя документа, как в Битриксе: «КП <комплект> - <поставка>».',
        type: String,
        example: 'КП Бухгалтерия - Интернет 3 ОД',
    })
    name: string;

    @ApiProperty({
        description: 'Размер файла в байтах.',
        type: Number,
        example: 148_233,
    })
    size: number;

    @ApiProperty({
        description:
            'Ссылка на файл в Битриксе; пусто — на Диск Битрикса он не попал.',
        type: String,
        nullable: true,
        example: 'https://portal.bitrix24.ru/disk/file/42',
    })
    bitrixLink: string | null;
}

export class OfferPdfGenerateResponseDto implements OfferPdfGenerateResult {
    @ApiProperty({
        description:
            'Публичная ссылка на PDF. Файлов несколько — ссылка на первый, все файлы перечислены в links.',
        type: String,
        example: 'https://app.example.ru/api/files/abc123',
    })
    link: string;

    @ApiProperty({
        description: 'Имя первого файла в хранилище.',
        type: String,
        example: 'offer-7f3c….pdf',
    })
    fileName: string;

    @ApiProperty({
        description: 'Каким шаблоном собран документ.',
        enum: OfferPdfTemplateCode,
        enumName: 'OfferPdfTemplateCode',
        example: OfferPdfTemplateCode.CLASSIC,
    })
    templateCode: OfferPdfTemplateCode;

    @ApiProperty({
        description:
            'Время рендера PDF в миллисекундах; у нескольких вариантов — сумма по всем документам.',
        type: Number,
        example: 180,
    })
    durationMs: number;

    @ApiProperty({
        description: 'Размер первого файла в байтах.',
        type: Number,
        example: 148_233,
    })
    size: number;

    @ApiProperty({
        description:
            'Картинки и логотипы стиля, которых нет на сервере (пути внутри storage/app): документ собран без них. Пусто — всё на месте.',
        type: [String],
        example: [],
    })
    missingAssets: string[];

    @ApiProperty({
        description:
            'Все файлы (КП и счета) загружены на Диск Битрикса и упомянуты в таймлайне сделки.',
        type: Boolean,
        example: true,
    })
    savedToDeal: boolean;

    @ApiProperty({
        description:
            'Ссылка на первый файл КП в Битриксе; пусто — загрузка не удалась.',
        type: String,
        nullable: true,
        example: 'https://portal.bitrix24.ru/disk/file/42',
    })
    bitrixLink: string | null;

    @ApiProperty({
        description:
            'Почему файлы не прикреплены к сделке; пусто — прикреплены или не запрашивалось.',
        type: String,
        nullable: true,
        example: 'Не удалось прикрепить файл к сделке: нет доступа к Диску',
    })
    dealMessage: string | null;

    @ApiPropertyOptional({
        description:
            'Все готовые файлы по порядку. Файл один, когда варианты склеены в один PDF или печатается одно КП; по файлу на вариант — при separateDocuments и когда склейка не удалась. Первый файл повторяют поля link, fileName, size и bitrixLink.',
        type: [OfferPdfGeneratedFileDto],
    })
    links?: OfferPdfGeneratedFileDto[];

    @ApiProperty({
        description:
            'Счета к КП: файл на каждый набор, по порядку (общий счёт, затем счета наборов для сравнения). Формат PDF; при сбое перевода в PDF файл остаётся DOCX. Шаблон счёта подбирается так же, как у Word-КП, по порталу, поставщику, типу клиента и виду поставки. Пусто — счёт не запрашивали (нет invoice или оба флага выключены) или он не собран: причина в warnings. Сбой счёта КП не отменяет.',
        type: [OfferPdfGeneratedFileDto],
    })
    invoiceLinks: OfferPdfGeneratedFileDto[];

    @ApiPropertyOptional({
        description:
            'Что не сошлось при слиянии вариантов (сроки, скидки), почему файлы не склеены и почему не собран счёт («Счёт не сформирован: <причина>») — для показа менеджеру.',
        type: [String],
        example: [],
    })
    warnings?: string[];
}
