import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { DealSendFieldDto } from '../../../modules/deal-send/dto/deal-send.dto';

/**
 * Облегчённая поставка: сервисная сделка создаётся напрямую из конструктора,
 * минуя RPA «Поставка».
 *
 * Обычный путь — конструктор → заявка RPA → робот → сервисная сделка. Здесь
 * менеджер заполняет только обязательный минимум, который иначе вводился бы в
 * карточке заявки, и сделка создаётся сразу.
 */
export class DirectServiceDealDto {
    @ApiProperty({ type: String, example: 'gsr.bitrix24.ru' })
    @IsNotEmpty()
    @IsString()
    domain: string;

    @ApiProperty({
        type: Number,
        example: 159701,
        description:
            'Сделка отдела продаж, по которой делается поставка: из неё берутся поля, товарные строки, слепок конструктора и все варианты комплекта',
    })
    @IsInt()
    @Type(() => Number)
    sourceDealId: number;

    @ApiProperty({
        type: Number,
        description:
            'Менеджер ОРК — становится ответственным у сервисной сделки, компании и её контактов',
    })
    @IsInt()
    @Type(() => Number)
    managerOsId: number;

    @ApiProperty({
        type: String,
        description:
            'Рег-лист компании (номер в АРМ, поле компании UF_CRM_USER_CARDNUM). Обязателен: менеджер видит текущий и либо оставляет его, либо заменяет',
    })
    @IsNotEmpty()
    @IsString()
    companyRegistrationList: string;

    @ApiProperty({
        type: [Number],
        required: false,
        description:
            'Контакты сделки — им тоже меняется ответственный. Не переданы — берутся из сделки-источника',
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Type(() => Number)
    contactIds?: number[];

    @ApiProperty({
        type: String,
        required: false,
        description:
            'Дата окончания договора — по ней выбирается стадия сервисной воронки. Не передана — стадия остаётся дефолтной',
    })
    @IsOptional()
    @IsString()
    contractEnd?: string;

    @ApiProperty({
        type: [DealSendFieldDto],
        description:
            'Поля сервисной сделки кодами pbx — то, что обычно заполняли в карточке RPA (даты поставки и первого платежа, номера договора и счёта, описание ситуации и т.д.)',
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => DealSendFieldDto)
    fields: DealSendFieldDto[];
}

/** Что конструктору показать в форме до создания сделки. */
export class DirectServiceDealPrepareResponseDto {
    @ApiProperty({ type: Number, nullable: true })
    companyId: number | null;

    @ApiProperty({ type: String, nullable: true })
    companyTitle: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description:
            'Текущий рег-лист компании: менеджер видит его и решает — оставить или заменить',
    })
    currentRegistrationList: string | null;

    @ApiProperty({ type: [Number] })
    contactIds: number[];

    @ApiProperty({
        type: Number,
        description: 'Сколько вариантов комплекта переедет вместе со сделкой',
    })
    variantsCount: number;
}

/** Результат облегчённой поставки. */
export class DirectServiceDealResponseDto {
    @ApiProperty({ type: Number })
    dealId: number;

    @ApiProperty({
        type: Boolean,
        description: 'Слепок конструктора перенесён на новую сделку',
    })
    snapshotCopied: boolean;

    @ApiProperty({
        type: Number,
        description: 'Сколько вариантов комплекта перенесено',
    })
    variantsCopied: number;

    @ApiProperty({
        type: [String],
        description: 'Коды полей, которых нет в схеме портала — не записаны',
    })
    skippedFieldCodes: string[];
}
