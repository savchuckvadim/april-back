import { ApiProperty } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
} from 'class-validator';
import { EDITABLE_PBX_FIELD_CODES } from '../constants/pbx-fields.const';

/**
 * Запрос изменения значения одного pbx-поля одной сущности.
 * Синхронная ручка (без очереди/WS): запись в Bitrix — лёгкая мутация.
 */
export class PbxFieldUpdateRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Код редактируемого поля (whitelist из конфига EDITABLE_PBX_FIELDS).',
        enum: EDITABLE_PBX_FIELD_CODES,
        example: 'contract_type',
    })
    @IsIn(EDITABLE_PBX_FIELD_CODES)
    fieldCode: string;

    @ApiProperty({
        description:
            'ID сущности Bitrix, на которой живёт поле: для deal-полей — ' +
            'ID сделки, для company-полей — ID компании (entity поля в meta).',
        type: Number,
        example: 2048,
    })
    @IsInt()
    @IsPositive()
    entityId: number;

    @ApiProperty({
        description:
            'Новое значение: для enum — семантический code элемента; для date — ' +
            'ISO-дата yyyy-MM-dd. null/пропуск — очистить поле.',
        type: String,
        nullable: true,
        example: 'commerc',
    })
    @IsOptional()
    @IsString()
    value?: string | null;
}

/** Подтверждение записи: нормализованное сохранённое значение. */
export class PbxFieldUpdateResponseDto {
    @ApiProperty({
        description: 'Код поля.',
        type: String,
        example: 'contract_type',
    })
    fieldCode: string;

    @ApiProperty({
        description: 'ID сущности.',
        type: Number,
        example: 2048,
    })
    entityId: number;

    @ApiProperty({
        description:
            'Сохранённое значение (code элемента / ISO-дата), null — очищено.',
        type: String,
        nullable: true,
        example: 'commerc',
    })
    value: string | null;
}
