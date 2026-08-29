import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { QUESTIONNAIRE_FIELD_TYPE_CONTROLS } from '@lib/portal-lib/store/questionnaires';
import {
    EnumQuestionnaireFieldSource,
    QUESTIONNAIRE_FIELD_SOURCES,
    QuestionnaireFieldSourceDto,
} from './questionnaire-field-source.dto';
import { QuestionnaireFieldDto } from './questionnaire-field.dto';

/**
 * Типы поля, которые админка умеет ЗАВОДИТЬ.
 *
 * Список не свой: это те же строки матрицы «тип поля → типы отображения»
 * из реестра анкет, у которых есть хотя бы один контрол. Отдельный
 * перечень здесь означал бы, что владельцу дают завести поле, которое
 * анкета потом не сможет заполнить, — и узнал бы он об этом уже при
 * сборке вопроса.
 */
export const QUESTIONNAIRE_CREATABLE_FIELD_TYPES: string[] = Object.entries(
    QUESTIONNAIRE_FIELD_TYPE_CONTROLS,
)
    .filter(([, controls]) => controls.length > 0)
    .map(([fieldType]) => fieldType);

/** Значение справочника создаваемого поля-списка. */
export class QuestionnaireFieldCreateItemDto {
    @ApiProperty({
        description: 'Подпись значения, как её увидит менеджер.',
        type: String,
        example: 'Тендер',
    })
    @IsString()
    title: string;

    @ApiPropertyOptional({
        description:
            'Внешний код значения (xmlId). Переживает переименование ' +
            'подписи в Битриксе — по нему вариант анкеты и опознаётся.',
        type: String,
        example: 'tender',
    })
    @IsOptional()
    @IsString()
    code?: string;

    @ApiPropertyOptional({
        description: 'Порядок значения в списке. По умолчанию — по очереди.',
        type: Number,
        example: 200,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    sort?: number;
}

/** Тело `POST /questionnaire-fields`: какое поле завести в носителе. */
export class QuestionnaireFieldCreateDto {
    @ApiProperty({
        description: 'Носитель, в котором заводим поле.',
        enum: QUESTIONNAIRE_FIELD_SOURCES,
        example: EnumQuestionnaireFieldSource.smart,
    })
    @IsIn(QUESTIONNAIRE_FIELD_SOURCES, {
        message:
            'Неизвестный носитель: допустимы ' +
            QUESTIONNAIRE_FIELD_SOURCES.join(', '),
    })
    entity: EnumQuestionnaireFieldSource;

    @ApiPropertyOptional({
        description:
            'Обязателен для носителя «смарт-процесс»: идентификатор строки ' +
            'из `GET /sources` (наша БД, НЕ идентификатор Битрикса).',
        type: Number,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    smartId?: number;

    @ApiProperty({
        description:
            'Код поля — постфикс UF-имени и его xmlId. Допустимы латинские ' +
            'буквы, цифры и подчёркивание; регистр приводится к верхнему. ' +
            'Он же ключ повтора: второй вызов с тем же кодом не заводит ' +
            'дубль, а возвращает уже созданное поле.',
        type: String,
        example: 'DECISION_DATE',
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Подпись поля в карточке портала.',
        type: String,
        example: 'Дата принятия решения',
    })
    @IsString()
    title: string;

    @ApiProperty({
        description:
            'Тип поля Битрикса (`userTypeId`). Допустимы только типы, ' +
            'которые анкета умеет заполнять, — строки матрицы ' +
            '`fieldTypeControls` из `GET /questionnaires/schema`.',
        type: String,
        enum: QUESTIONNAIRE_CREATABLE_FIELD_TYPES,
        example: 'enumeration',
    })
    @IsIn(QUESTIONNAIRE_CREATABLE_FIELD_TYPES, {
        message:
            'Поле такого типа анкета заполнить не умеет: допустимы ' +
            QUESTIONNAIRE_CREATABLE_FIELD_TYPES.join(', '),
    })
    type: string;

    @ApiPropertyOptional({
        description: 'Сделать поле обязательным в карточке портала.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isRequired?: boolean;

    @ApiPropertyOptional({
        description:
            'Множественное поле. Принимается только чтобы ответить ' +
            'внятным отказом: ответ анкеты уехал бы в первый элемент и ' +
            'исчез, поэтому такие поля она не берёт.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isMultiple?: boolean;

    @ApiPropertyOptional({
        description:
            'Значения справочника — обязательны для типа `enumeration` и ' +
            'бессмысленны для остальных.',
        type: [QuestionnaireFieldCreateItemDto],
    })
    // Пустой список НЕ отклоняем здесь: пустоту объясняет запись поля —
    // по-русски и с причиной («выбирать менеджеру будет не из чего»),
    // а не строкой валидатора «items should not be empty».
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionnaireFieldCreateItemDto)
    items?: QuestionnaireFieldCreateItemDto[];
}

/** Ответ `POST /questionnaire-fields`. */
export class QuestionnaireFieldCreateResponseDto {
    @ApiProperty({
        description: 'Носитель, в котором поле заведено.',
        type: QuestionnaireFieldSourceDto,
    })
    source: QuestionnaireFieldSourceDto;

    @ApiProperty({
        description:
            'Поле РОВНО в том виде, в каком его отдаёт список полей: имя и ' +
            'идентификаторы элементов списка прочитаны из Битрикса после ' +
            'записи, а не собраны формулой. Админка собирает из него вопрос ' +
            'без второго запроса.',
        type: QuestionnaireFieldDto,
    })
    field: QuestionnaireFieldDto;

    @ApiProperty({
        description:
            'Поле создано этим вызовом. `false` — поле с таким кодом уже ' +
            'было в носителе, и мы вернули его как есть.',
        type: Boolean,
    })
    created: boolean;

    @ApiPropertyOptional({
        description:
            'Чем результат отличается от заказанного: поле уже было и его ' +
            'настройки другие, элементы списка не совпали и т.п.',
        type: String,
    })
    warning?: string;
}
