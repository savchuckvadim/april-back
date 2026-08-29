import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionnaireFieldSourceDto } from './questionnaire-field-source.dto';

/** Вариант списка живого поля: `id` — то самое значение для `crm.*.update`. */
export class QuestionnaireFieldItemDto {
    @ApiProperty({
        description:
            'Идентификатор элемента списка в Битриксе. Именно он уходит в ' +
            '`crm.*.update` — сохранять в анкете нужно его, а не подпись.',
        type: Number,
        nullable: true,
        example: 1247,
    })
    id: number | null;

    @ApiProperty({
        description: 'Подпись варианта, как её видит менеджер.',
        type: String,
        example: 'Тендер',
    })
    value: string;

    @ApiProperty({
        description:
            'Внешний код элемента. В degraded-режиме недоступен — null.',
        type: String,
        nullable: true,
    })
    xmlId: string | null;
}

/** Где поле уже используется: анкета и вопрос. */
export class QuestionnaireFieldUsageDto {
    @ApiProperty({ type: String }) questionnaireId: string;
    @ApiProperty({ type: String }) questionnaireCode: string;
    @ApiProperty({ type: String }) questionnaireTitle: string;
    @ApiProperty({ type: String }) itemCode: string;
    @ApiProperty({ type: String }) itemTitle: string;
}

/** Живое пользовательское поле носителя. */
export class QuestionnaireFieldDto {
    @ApiProperty({
        description:
            'UF-имя ровно как его вернул Битрикс. В анкету уходит эта ' +
            'строка целиком: собирать имя конкатенацией нельзя — у ' +
            'смартов оно выглядит как UF_CRM_7_CODE.',
        type: String,
        example: 'UF_CRM_1712345678',
    })
    fieldName: string;

    @ApiProperty({
        description: 'Название поля на портале (подпись формы).',
        type: String,
        example: 'Дата принятия решения',
    })
    title: string;

    @ApiProperty({
        description:
            'Тип поля Битрикса (`userTypeId`). По нему редактор ' +
            'фильтрует допустимые типы отображения — матрица приходит в ' +
            '`GET /questionnaires/schema`.',
        type: String,
        example: 'date',
    })
    type: string;

    @ApiProperty({
        description:
            'Множественное поле. В анкету такие брать пока нельзя: ответ ' +
            'записался бы в первый элемент и исчез.',
        type: Boolean,
    })
    multiple: boolean;

    @ApiProperty({
        description: 'Поле обязательно на портале.',
        type: Boolean,
    })
    mandatory: boolean;

    @ApiProperty({
        description:
            'Идентификатор поля в Битриксе. В degraded-режиме недоступен.',
        type: Number,
        nullable: true,
    })
    bitrixId: number | null;

    @ApiPropertyOptional({
        description: 'Внешний код поля. В degraded-режиме недоступен.',
        type: String,
        nullable: true,
    })
    xmlId?: string | null;

    @ApiProperty({
        description: 'Варианты списка — только у полей типа `enumeration`.',
        type: [QuestionnaireFieldItemDto],
    })
    items: QuestionnaireFieldItemDto[];

    @ApiProperty({
        description:
            'Поле есть в нашем слепке `bitrixfields` — значит его ставил ' +
            'установщик. false = поле завёл пользователь ВРУЧНУЮ; строку в ' +
            'слепок мы для него не создаём никогда (переустановка сущности ' +
            'сносит все её строки вместе со смыслом анкеты).',
        type: Boolean,
    })
    inPortalDb: boolean;

    @ApiPropertyOptional({
        description: 'Код поля в нашем слепке — если поле оттуда.',
        type: String,
        nullable: true,
        example: 'op_client_type',
    })
    portalCode?: string | null;

    @ApiPropertyOptional({
        description:
            'Анкеты и вопросы портала, которые уже привязаны к этому полю.',
        type: [QuestionnaireFieldUsageDto],
    })
    usedIn?: QuestionnaireFieldUsageDto[];
}

/** Ответ `GET /questionnaire-fields`. */
export class QuestionnaireFieldsResponseDto {
    @ApiProperty({
        description: 'Носитель, поля которого прочитаны.',
        type: QuestionnaireFieldSourceDto,
    })
    source: QuestionnaireFieldSourceDto;

    @ApiProperty({
        description: 'Пользовательские поля носителя (UF_CRM_*).',
        type: [QuestionnaireFieldDto],
    })
    fields: QuestionnaireFieldDto[];

    @ApiProperty({
        description:
            'Читали урезанным способом (`crm.item.fields`), потому что у ' +
            'REST-ключа нет прав администратора CRM: нет xmlId и ' +
            'идентификаторов полей. Привязку сделать можно, но проверять ' +
            'её лучше уже с правами.',
        type: Boolean,
    })
    degraded: boolean;

    @ApiPropertyOptional({
        description: 'Что именно пошло не так — текстом для админки.',
        type: String,
    })
    error?: string;
}
