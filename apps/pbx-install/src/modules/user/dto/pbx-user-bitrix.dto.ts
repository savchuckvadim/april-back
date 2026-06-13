import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * DTO слоя «только Bitrix» для полей пользователя (UF_USR_*).
 *
 * Response-DTO документируют ключевые поля живого Bitrix-ответа; сам объект
 * приходит «как есть» (raw IBXField), лишние поля Swagger просто не показывает.
 */

export class BxUserFieldEnumItemDto {
    @ApiPropertyOptional({
        description: 'ID элемента списка в Bitrix.',
        example: '341',
        type: String,
    })
    ID?: string;

    @ApiProperty({
        description: 'Отображаемое значение элемента списка (VALUE).',
        example: 'В работе',
        type: String,
    })
    VALUE!: string;

    @ApiPropertyOptional({
        description:
            'XML_ID элемента списка (стабильный внешний идентификатор).',
        example: 'op_status_in_progress',
        type: String,
    })
    XML_ID?: string;

    @ApiProperty({
        description: 'Порядок сортировки элемента внутри списка.',
        example: '10',
        type: String,
    })
    SORT!: string;

    @ApiProperty({
        description: 'Признак значения по умолчанию.',
        example: 'N',
        enum: ['Y', 'N'],
    })
    DEF!: 'Y' | 'N';
}

export class BxUserFieldDto {
    @ApiProperty({
        description: 'ID определения пользовательского поля в Bitrix.',
        example: '123',
        type: String,
    })
    ID!: string;

    @ApiProperty({
        description: 'Системное имя поля в Bitrix (UF_USR_*).',
        example: 'UF_USR_EVENT_COMMENT',
        type: String,
    })
    FIELD_NAME!: string;

    @ApiProperty({
        description: 'Тип пользовательского поля Bitrix.',
        example: 'string',
        type: String,
    })
    USER_TYPE_ID!: string;

    @ApiProperty({
        description: 'Подпись поля (LABEL).',
        example: 'Комментарий события',
        type: String,
    })
    LABEL!: string;

    @ApiProperty({
        description: 'Признак множественности поля (MULTIPLE).',
        example: 'N',
        enum: ['Y', 'N'],
    })
    MULTIPLE!: 'Y' | 'N';

    @ApiProperty({
        description: 'Признак обязательности поля (MANDATORY).',
        example: 'N',
        enum: ['Y', 'N'],
    })
    MANDATORY!: 'Y' | 'N';

    @ApiPropertyOptional({
        description: 'XML_ID поля (стабильный внешний идентификатор).',
        example: 'event_comment',
        type: String,
    })
    XML_ID?: string | null;

    @ApiProperty({
        description: 'Порядок сортировки поля.',
        example: '100',
        type: String,
    })
    SORT!: string;

    @ApiPropertyOptional({
        description: 'Список значений для enumeration-поля.',
        type: [BxUserFieldEnumItemDto],
    })
    LIST?: BxUserFieldEnumItemDto[];
}

export class BxUserFieldsListResponseDto {
    @ApiProperty({
        description: 'Домен портала, у которого читались поля.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({
        description: 'Пользовательские поля пользователя из живого Bitrix.',
        type: [BxUserFieldDto],
    })
    fields!: BxUserFieldDto[];
}

export class BxUserInstalledFieldResultDto {
    @ApiProperty({
        description: 'Внутренний code поля (из шаблона-константы).',
        example: 'event_comment',
        type: String,
    })
    code!: string;

    @ApiProperty({
        description: 'Имя поля в Bitrix после установки.',
        example: 'UF_USR_EVENT_COMMENT',
        type: String,
    })
    bxFieldName!: string;

    @ApiProperty({
        description:
            'Результат операции Bitrix (id поля при создании или true/false).',
        example: 123,
    })
    result!: number | boolean;
}

export class BxUserFieldsInstallResponseDto {
    @ApiProperty({
        description: 'Домен портала, в который ставились поля.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({
        description: 'Сколько полей всего обрабатывалось.',
        example: 1,
        type: Number,
    })
    countTotal!: number;

    @ApiProperty({
        description: 'Сколько полей успешно установлено/обновлено в Bitrix.',
        example: 1,
        type: Number,
    })
    countSuccess!: number;

    @ApiProperty({
        description: 'Сколько полей не удалось установить.',
        example: 0,
        type: Number,
    })
    countFailed!: number;

    @ApiProperty({
        description: 'Коды ошибок Bitrix-батча (если были).',
        example: [],
        type: [String],
    })
    errorCodes!: string[];

    @ApiProperty({
        description: 'Детализация по каждому установленному полю.',
        type: [BxUserInstalledFieldResultDto],
    })
    results!: BxUserInstalledFieldResultDto[];
}

export class BxUserFieldDeleteResultDto {
    @ApiProperty({
        description: 'Внутренний code поля (из шаблона-константы).',
        example: 'event_comment',
        type: String,
    })
    code!: string;

    @ApiPropertyOptional({
        description:
            'ID удалённого поля в Bitrix (null, если поле не найдено).',
        example: '123',
        type: String,
    })
    bxFieldId!: string | null;

    @ApiProperty({
        description: 'Удалено ли поле в Bitrix.',
        example: true,
        type: Boolean,
    })
    deleted!: boolean;

    @ApiPropertyOptional({
        description: 'Текст ошибки, если удаление не выполнено.',
        example: 'field not found in Bitrix',
        type: String,
    })
    error?: string;
}

export class BxUserFieldsDeleteResponseDto {
    @ApiProperty({
        description: 'Домен портала, в котором удалялись поля.',
        example: 'april-dev.bitrix24.ru',
        type: String,
    })
    domain!: string;

    @ApiProperty({
        description: 'Результат удаления по каждому переданному code.',
        type: [BxUserFieldDeleteResultDto],
    })
    results!: BxUserFieldDeleteResultDto[];
}

/** Тело запроса на удаление полей пользователя только в Bitrix. */
export class DeleteBxUserFieldsDto {
    @ApiProperty({
        description:
            'Список code полей (из шаблона USER_FIELDS) для удаления только ' +
            'в Bitrix. Имя UF_USR_* вычисляется из шаблона по code.',
        example: ['event_comment'],
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    codes!: string[];
}
