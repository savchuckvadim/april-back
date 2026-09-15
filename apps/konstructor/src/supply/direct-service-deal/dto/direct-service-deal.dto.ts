import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { DealSendFieldDto } from '../../../modules/deal-send/dto/deal-send.dto';

/** Что делать с сервисной сделкой: создать новую или обновить существующую. */
export type DirectServiceDealMode = 'create' | 'update';

/** Runtime-список режимов: используется и в @IsIn, и в Swagger. */
export const DIRECT_SERVICE_DEAL_MODES = [
    'create',
    'update',
] as const satisfies readonly DirectServiceDealMode[];

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

    @ApiPropertyOptional({
        type: String,
        enum: DIRECT_SERVICE_DEAL_MODES,
        default: 'create',
        description:
            'Переотправка в отдел сервиса: create — создать новую сервисную сделку (поведение по умолчанию, обратная совместимость), update — обновить уже созданную, её id передаётся в targetDealId.',
    })
    @IsOptional()
    @IsString()
    @IsIn(DIRECT_SERVICE_DEAL_MODES as unknown as string[])
    mode?: DirectServiceDealMode;

    @ApiPropertyOptional({
        type: Number,
        example: 159800,
        description:
            'Сервисная сделка, которую обновляем. Обязателен при mode = update; при create игнорируется.',
    })
    @IsOptional()
    @IsInt()
    @Type(() => Number)
    targetDealId?: number;
}

/** Уже созданная сервисная сделка по этой же базовой сделке. */
export class ExistingServiceDealDto {
    @ApiProperty({ type: Number, example: 159800 })
    id: number;

    @ApiProperty({ type: String, nullable: true })
    title: string | null;

    @ApiProperty({ type: String, nullable: true, example: 'C5:REG_ONE' })
    stageId: string | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description: 'Дата создания сделки (DATE_CREATE как отдал битрикс).',
        example: '2026-09-01T10:15:00+03:00',
    })
    createdAt: string | null;

    @ApiProperty({
        type: String,
        enum: ['link', 'company'],
        description:
            'Как нашли: link — по полю-связи с базовой сделкой (надёжно), company — по компании и сервисной воронке (вероятная, но не гарантированная связь; менеджеру стоит показать это отдельно).',
    })
    matchedBy: 'link' | 'company';
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

    @ApiProperty({
        type: ExistingServiceDealDto,
        nullable: true,
        description:
            'Сервисная сделка, уже созданная по этой базовой. Не null — конструктор обязан спросить менеджера: обновить её (mode = update, targetDealId = id) или создать новую (mode = create).',
    })
    existingServiceDeal: ExistingServiceDealDto | null;
}

/** Результат облегчённой поставки. */
export class DirectServiceDealResponseDto {
    @ApiProperty({ type: Number })
    dealId: number;

    @ApiProperty({
        type: String,
        enum: ['created', 'updated'],
        description:
            'Что именно произошло: created — сервисная сделка создана, updated — обновлена существующая (mode = update).',
    })
    action: 'created' | 'updated';

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
