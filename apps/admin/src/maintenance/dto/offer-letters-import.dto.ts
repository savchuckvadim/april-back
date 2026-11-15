import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Тело запроса на перенос писем КП из легаси-шаблонов. */
export class OfferLettersImportDto {
    @ApiPropertyOptional({
        description:
            'Только показать, что будет перенесено, ничего не записывая. ' +
            'По умолчанию true — «сухой» запуск. Чтобы перенести, передать false.',
        default: true,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;
}

/** Что ручка сделала с письмом портала. */
export enum OfferLetterImportStatusEnum {
    /** Сухой запуск: письмо будет создано */
    WOULD_CREATE = 'would-create',
    CREATED = 'created',
    /** Уже перенесено раньше — повторно не создаётся */
    EXISTS = 'exists',
    /** В легаси-поле пустой текст — переносить нечего */
    EMPTY = 'empty',
}

/** Результат по одному легаси-письму. */
export class OfferLetterImportItemDto {
    @ApiProperty({ description: 'Портал', example: 1 })
    portalId!: number;

    @ApiProperty({
        description: 'Домен портала',
        example: 'april-garant.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({
        description: 'Легаси-поле `letter` в `fields`, откуда взят текст',
        example: 2,
    })
    legacyFieldId!: number;

    @ApiProperty({
        description: 'Длина текста письма в символах',
        example: 967,
    })
    length!: number;

    @ApiProperty({
        description: 'Было ли письмо включено в легаси (поле `isLetter`)',
        example: true,
    })
    enabled!: boolean;

    @ApiProperty({
        description:
            'Станет ли письмо письмом портала по умолчанию (у портала его ещё нет)',
        example: true,
    })
    isDefault!: boolean;

    @ApiProperty({
        description: 'Что сделано',
        enum: OfferLetterImportStatusEnum,
        example: OfferLetterImportStatusEnum.WOULD_CREATE,
    })
    status!: OfferLetterImportStatusEnum;
}

/** Ответ ручки переноса писем. */
export class OfferLettersImportResponseDto {
    @ApiProperty({
        description: 'Был ли запуск «сухим» (без записи в БД)',
        example: true,
    })
    dryRun!: boolean;

    @ApiProperty({
        description: 'Сколько писем создано (при dryRun — 0)',
        example: 0,
    })
    created!: number;

    @ApiProperty({
        description: 'Легаси-письма порталов и что с каждым сделано',
        type: [OfferLetterImportItemDto],
    })
    items!: OfferLetterImportItemDto[];
}
