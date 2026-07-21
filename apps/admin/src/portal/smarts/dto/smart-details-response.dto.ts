import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SmartResponseDto } from './smart-response.dto';

/** Значение enum-поля смарта. */
export class SmartFieldEnumItemDto {
    @ApiProperty({
        description: 'Bitrix id значения.',
        example: 51,
        type: Number,
    })
    id: number;

    @ApiProperty({
        description: 'Отображаемое значение.',
        example: 'Презентация',
        type: String,
    })
    value: string;

    @ApiPropertyOptional({
        description: 'Символьный код значения (xmlId).',
        example: 'presentation',
        type: String,
    })
    xmlId?: string;
}

/** UF-поле смарта (userfieldconfig). */
export class SmartFieldDto {
    @ApiProperty({
        description: 'Полное UF-имя поля.',
        example: 'UF_CRM_128_CALL_TYPE',
        type: String,
    })
    fieldName: string;

    @ApiProperty({
        description: 'Название поля (русская подпись формы).',
        example: 'Тип звонка',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Тип поля Bitrix (string/enumeration/boolean/...).',
        example: 'enumeration',
        type: String,
    })
    type: string;

    @ApiProperty({
        description: 'Множественное ли поле.',
        example: false,
        type: Boolean,
    })
    multiple: boolean;

    @ApiPropertyOptional({
        description: 'Символьный код (xmlId) поля.',
        example: 'CALL_TYPE',
        type: String,
    })
    xmlId?: string;

    @ApiPropertyOptional({
        description: 'Значения enum-поля (только для enumeration).',
        type: [SmartFieldEnumItemDto],
    })
    items?: SmartFieldEnumItemDto[];
}

/** Стадия смарта. */
export class SmartStageDto {
    @ApiProperty({
        description: 'STATUS_ID стадии.',
        example: 'DT128_10:NEW',
        type: String,
    })
    statusId: string;

    @ApiProperty({
        description: 'Название стадии.',
        example: 'Новый',
        type: String,
    })
    name: string;
}

/** Воронка (категория) смарта со стадиями. */
export class SmartCategoryDto {
    @ApiProperty({
        description: 'Id категории в Bitrix.',
        example: 10,
        type: Number,
    })
    id: number;

    @ApiProperty({
        description: 'Название категории.',
        example: 'Общая',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Стадии категории.',
        type: [SmartStageDto],
    })
    stages: SmartStageDto[];
}

/** Живое состояние смарта в Bitrix. */
export class SmartBitrixStateDto {
    @ApiProperty({
        description: 'entityTypeId смарта в CRM.',
        example: 128,
        type: Number,
    })
    entityTypeId: number;

    @ApiProperty({
        description: 'Символьный код типа.',
        example: 'aicall_report',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Название смарта в Bitrix.',
        example: 'AI-анализ звонков',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Воронки со стадиями.',
        type: [SmartCategoryDto],
    })
    categories: SmartCategoryDto[];

    @ApiProperty({
        description: 'UF-поля смарта.',
        type: [SmartFieldDto],
    })
    fields: SmartFieldDto[];
}

/** Детали смарта: строка БД + живое состояние в Bitrix. */
export class SmartDetailsResponseDto {
    @ApiProperty({
        description: 'Строка смарта из таблицы smarts.',
        type: SmartResponseDto,
    })
    smart: SmartResponseDto;

    @ApiProperty({
        description: 'Домен портала, на котором живёт смарт.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiPropertyOptional({
        description:
            'Живое состояние в Bitrix (null — если портал/смарт недоступен; причина в error).',
        type: SmartBitrixStateDto,
    })
    bitrix?: SmartBitrixStateDto | null;

    @ApiPropertyOptional({
        description: 'Ошибка получения живого состояния (если bitrix=null).',
        example: 'Portal not found',
        type: String,
    })
    error?: string;
}
