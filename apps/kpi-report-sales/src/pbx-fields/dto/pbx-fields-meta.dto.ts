import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import {
    PBX_FIELD_ENTITIES,
    PBX_FIELD_VALUE_KINDS,
    PbxFieldEntity,
    PbxFieldValueKind,
} from '../constants/pbx-fields.const';

/** Запрос метаданных редактируемых pbx-полей портала. */
export class PbxFieldsMetaRequestDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24. По нему PBXService.init отдаёт портал ' +
            'с настроенными полями и их enum-элементами.',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

/**
 * Элемент enum-поля. Наружу отдаём ТОЛЬКО семантический code + name:
 * numeric id Bitrix остаётся на бэке (фронт оперирует кодами, резолв
 * code→bitrixId делает write-сервис).
 */
export class PbxFieldItemDto {
    @ApiProperty({
        description: 'Семантический код элемента (стабилен между порталами).',
        type: String,
        example: 'commerc',
    })
    code: string;

    @ApiProperty({
        description: 'Отображаемое название элемента.',
        type: String,
        example: 'Коммерческие',
    })
    name: string;
}

/** Метаданные одного редактируемого pbx-поля. */
export class PbxFieldMetaDto {
    @ApiProperty({
        description: 'Семантический код поля (истинная типизация portal-lib).',
        type: String,
        example: 'contract_type',
    })
    code: string;

    @ApiProperty({
        description: 'Сущность Bitrix, на которой живёт значение поля.',
        enum: PBX_FIELD_ENTITIES,
        example: 'deal',
    })
    entity: PbxFieldEntity;

    @ApiProperty({
        description:
            'Вид значения: enum — выбор из items по code; ' +
            'date — ISO-дата yyyy-MM-dd или null (очистить).',
        enum: PBX_FIELD_VALUE_KINDS,
        example: 'enum',
    })
    valueKind: PbxFieldValueKind;

    @ApiProperty({
        description: 'Человекочитаемое название поля (с портала).',
        type: String,
        example: 'Тип договора',
    })
    name: string;

    @ApiProperty({
        description:
            'Требовать подтверждение в UI перед сохранением ' +
            '(поля, влияющие на расчёты/документы).',
        type: Boolean,
        example: true,
    })
    confirm: boolean;

    @ApiProperty({
        description:
            'Элементы enum-поля этого портала (для contract_type — свои ' +
            'на каждом портале). Для date-полей — пустой массив.',
        type: [PbxFieldItemDto],
    })
    items: PbxFieldItemDto[];
}

/** Ответ метаданных: все редактируемые поля портала. */
export class PbxFieldsMetaResponseDto {
    @ApiProperty({
        description: 'Метаданные редактируемых полей.',
        type: [PbxFieldMetaDto],
    })
    fields: PbxFieldMetaDto[];
}
