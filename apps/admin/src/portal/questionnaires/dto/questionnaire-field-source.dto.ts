import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    EnumQuestionnaireFieldSource,
    QUESTIONNAIRE_FIELD_SOURCES,
} from '@lib/portal-lib/store/questionnaires';

/**
 * Носитель пользовательских полей, из которых собирается анкета: четыре
 * штатные сущности CRM плюс каждый смарт-процесс портала.
 *
 * Реестр — один, в сторе анкет: тем же списком валидация на сохранении
 * связывает выбранное поле с сущностью, куда фрейм запишет ответ. Свой
 * список здесь означал бы, что пикер предлагает носителя, до которого
 * ответ не доедет.
 */
export { EnumQuestionnaireFieldSource, QUESTIONNAIRE_FIELD_SOURCES };

/** Один носитель полей в списке выбора админки. */
export class QuestionnaireFieldSourceDto {
    @ApiProperty({
        description: 'Тип носителя.',
        enum: QUESTIONNAIRE_FIELD_SOURCES,
        example: EnumQuestionnaireFieldSource.company,
    })
    entity: EnumQuestionnaireFieldSource;

    @ApiProperty({
        description:
            'Идентификатор строки smarts в НАШЕЙ БД (не идентификатор ' +
            'Битрикса). Именно он передаётся обратно в `?smartId=`. Для ' +
            'штатных сущностей — null.',
        type: Number,
        nullable: true,
    })
    smartId: number | null;

    @ApiProperty({
        description:
            'entityTypeId Битрикса: лид 1, сделка 2, контакт 3, компания ' +
            '4, смарт — свой (напр. 177). Используется методами ' +
            '`crm.item.*`.',
        type: Number,
        example: 4,
    })
    entityTypeId: number;

    @ApiProperty({
        description:
            'Идентификатор смарт-типа из `crm.type.list` («маленький», ' +
            'напр. 7) — ТОЛЬКО он адресует поля в userfieldconfig. Для ' +
            'штатных сущностей — null.',
        type: Number,
        nullable: true,
    })
    bitrixId: number | null;

    @ApiProperty({
        description: 'Название носителя для списка выбора.',
        type: String,
        example: 'Компания',
    })
    title: string;

    @ApiPropertyOptional({
        description:
            'Почему поля этого носителя прочитать не получится (смарт без ' +
            'идентификатора типа и т.п.). Пусто — носитель исправен.',
        type: String,
    })
    warning?: string;
}

/** Ответ `GET /questionnaire-fields/sources`. */
export class QuestionnaireFieldSourcesResponseDto {
    @ApiProperty({
        description: 'Домен портала, у которого спрашиваем поля.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Штатные сущности CRM всегда первыми, дальше смарты портала.',
        type: [QuestionnaireFieldSourceDto],
    })
    sources: QuestionnaireFieldSourceDto[];
}
