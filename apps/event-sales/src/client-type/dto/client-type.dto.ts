import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { CLIENT_TYPE_CODES, ClientTypeCode } from '../lib/client-type.const';
import { IClientTypeState } from '../services/client-type.service';

/* ------------------------------------------------------------------ *
 * Вход
 * ------------------------------------------------------------------ */

export class AlignClientTypeRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс, в котором живёт сделка.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

export class SetClientTypeRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Код типа клиента: state — Бюджетники, commerc — Коммерческие, ' +
            'ip — ИП, fiz — Физ лицо, layer — Адвокаты.',
        enum: CLIENT_TYPE_CODES,
        example: 'commerc',
    })
    @IsIn(CLIENT_TYPE_CODES)
    code: ClientTypeCode;

    @ApiPropertyOptional({
        description:
            'Сделка, открытая во фрейме. Открытая сделка получает тип вместе ' +
            'с компанией, закрытая не меняется.',
        type: Number,
        example: 105819,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    dealId?: number;

    @ApiPropertyOptional({
        description: 'Компания клиента. Не передана — берётся компания сделки.',
        type: Number,
        example: 180875,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;
}

/* ------------------------------------------------------------------ *
 * Выход
 * ------------------------------------------------------------------ */

export class ClientTypeStateDto implements IClientTypeState {
    @ApiPropertyOptional({
        description:
            'Тип клиента для шапки: у компании, без него — у сделки; null — ' +
            'не указан.',
        enum: CLIENT_TYPE_CODES,
        nullable: true,
        example: 'commerc',
    })
    current: ClientTypeCode | null;

    @ApiPropertyOptional({
        description: 'Тип клиента в сделке; null — пусто.',
        enum: CLIENT_TYPE_CODES,
        nullable: true,
        example: 'commerc',
    })
    deal: ClientTypeCode | null;

    @ApiPropertyOptional({
        description: 'Тип клиента в компании; null — пусто или компании нет.',
        enum: CLIENT_TYPE_CODES,
        nullable: true,
        example: 'commerc',
    })
    company: ClientTypeCode | null;

    @ApiProperty({
        description:
            'У сделки и компании разные типы — какой верный, решает человек.',
        type: Boolean,
        example: false,
    })
    conflict: boolean;

    @ApiProperty({
        description: 'Что не удалось записать при выравнивании.',
        type: [String],
        example: [],
    })
    warnings: string[];
}

/** Ответ выравнивания при открытии сделки. */
export class ClientTypeAlignResponseDto extends ClientTypeStateDto {
    @ApiProperty({
        description:
            'Сервер недавно уже выравнивал эту сделку (в течение 15 минут) и ' +
            'не повторял: значения тогда null, шапку не трогать.',
        type: Boolean,
        example: false,
    })
    skipped: boolean;
}
