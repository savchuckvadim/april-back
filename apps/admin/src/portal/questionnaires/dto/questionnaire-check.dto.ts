import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PortalQuestionnaireDto } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.dto';
import {
    EnumQuestionnaireFieldStatus,
    QUESTIONNAIRE_FIELD_STATUSES,
} from '@lib/portal-lib/store/questionnaires';

/** Подпись: наша против живой. */
export class QuestionnaireTitleDiffDto {
    @ApiProperty({
        description: 'Наша формулировка (то, что видит менеджер).',
        example: 'Когда клиент примет решение?',
        type: String,
    })
    our: string;

    @ApiProperty({
        description: 'Подпись поля в Битриксе прямо сейчас.',
        example: 'Дата решения',
        type: String,
    })
    live: string;
}

/** Вариант списка, который есть в Битриксе, а у нас его нет. */
export class QuestionnaireNewOptionDto {
    @ApiProperty({
        description:
            'Идентификатор элемента списка: с ним вариант и заводится, ' +
            'без него ответ в поле не записать.',
        example: 301,
        type: Number,
    })
    bitrixId: number;

    @ApiProperty({
        description: 'Подпись варианта в Битриксе.',
        example: 'Субподряд',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Внешний код элемента списка, если он задан.',
        type: String,
        nullable: true,
    })
    xmlId: string | null;
}

/**
 * Наш вариант, элемент списка которого ПЕРЕИМЕНОВАЛИ в Битриксе.
 *
 * Как и у подписи поля, расхождение считается со слепком принятого, а не с
 * нашей подписью: её владелец правит под менеджера («Прямая» → «Прямые
 * продажи»), и сравнение с ней зажигало бы строку у каждого второго
 * варианта.
 */
export class QuestionnaireRenamedOptionDto {
    @ApiProperty({ type: String }) optionId: string;
    @ApiProperty({ type: String }) code: string;

    @ApiProperty({
        description: 'Наша подпись варианта.',
        type: String,
    })
    our: string;

    @ApiProperty({
        description: 'Подпись того же элемента списка в Битриксе.',
        type: String,
    })
    live: string;

    @ApiProperty({
        description: 'Идентификатор элемента списка, по которому опознали.',
        type: Number,
        nullable: true,
    })
    bitrixId: number | null;
}

/** Наш вариант, которого в Битриксе больше нет: этой сверкой погашен. */
export class QuestionnaireLostOptionDto {
    @ApiProperty({ type: String }) optionId: string;
    @ApiProperty({ type: String }) code: string;
    @ApiProperty({ type: String }) title: string;
}

/**
 * Разбор расхождений одного вопроса — ДАННЫЕ, а не действие.
 *
 * Сама сверка ничего из этого не применяет: подписи вопроса и вариантов
 * владелец правит под себя, и затирать их живым текстом Битрикса молча
 * нельзя. Применяется выбранное отдельной кнопкой —
 * `POST /questionnaires/:id/apply-field-sync`.
 *
 * Исключение, которое сверка правит всегда сама: `bitrixId` варианта и
 * гашение исчезнувшего. Это не текст, а адрес записи — он обязан быть
 * верным без спроса.
 */
export class QuestionnaireCheckDiffDto {
    @ApiProperty({
        description:
            'Поле ПЕРЕИМЕНОВАЛИ в Битриксе: живая подпись разошлась со ' +
            'слепком, который владелец принял (`meta.bitrixField.accepted`). ' +
            'null — не переименовывали. С формулировкой вопроса живая ' +
            'подпись НЕ сравнивается: она авторская («Дата решения» в поле ' +
            'против «Когда клиент примет решение?» в анкете), и такая ' +
            'строка загоралась бы почти у каждого вопроса.',
        type: QuestionnaireTitleDiffDto,
        nullable: true,
    })
    title: QuestionnaireTitleDiffDto | null;

    @ApiProperty({
        description:
            'Варианты списка, появившиеся в Битриксе. Сами они не ' +
            'заводятся: какие из них показывать менеджеру, решает ' +
            'владелец.',
        type: [QuestionnaireNewOptionDto],
    })
    newOptions: QuestionnaireNewOptionDto[];

    @ApiProperty({
        description:
            'Варианты, переименованные в Битриксе (элемент списка тот же, ' +
            'подпись другая).',
        type: [QuestionnaireRenamedOptionDto],
    })
    renamedOptions: QuestionnaireRenamedOptionDto[];

    @ApiProperty({
        description:
            'Варианты, которых в Битриксе больше нет: этой же сверкой ' +
            'погашены — применять нечего, это отчёт.',
        type: [QuestionnaireLostOptionDto],
    })
    lostOptions: QuestionnaireLostOptionDto[];
}

/** Что стало с привязкой одного вопроса после сверки. */
export class QuestionnaireCheckItemDto {
    @ApiProperty({ type: String }) itemId: string;
    @ApiProperty({ type: String }) itemCode: string;

    @ApiProperty({
        description: 'UF-имя, по которому искали поле.',
        type: String,
        nullable: true,
    })
    fieldName: string | null;

    @ApiProperty({
        description:
            'Состояние привязки после сверки. В degraded-режиме — прежнее ' +
            'состояние: по неполным данным поле не «теряем».',
        enum: QUESTIONNAIRE_FIELD_STATUSES,
    })
    status: EnumQuestionnaireFieldStatus;

    @ApiProperty({
        description: 'Статус изменился этой проверкой.',
        type: Boolean,
    })
    changed: boolean;

    @ApiProperty({
        description:
            'Сколько вариантов справочника погашено: их больше нет в ' +
            'Битриксе.',
        type: Number,
    })
    deactivatedOptions: number;

    @ApiPropertyOptional({
        description: 'Человеческое пояснение к статусу.',
        type: String,
        example: 'Поле есть, но сменило тип: было date, стало string.',
    })
    comment?: string;

    @ApiProperty({
        description:
            'Разбор расхождений с Битриксом. null — разбирать не по ' +
            'чему: поле не найдено или читалось урезанным способом. ' +
            'Сказать «поле переименовали» можно, только увидев его ' +
            'по-настоящему.',
        type: QuestionnaireCheckDiffDto,
        nullable: true,
    })
    diff: QuestionnaireCheckDiffDto | null;
}

/** Ответ `POST /questionnaires/:id/check`. */
export class QuestionnaireCheckResponseDto {
    @ApiProperty({
        description: 'Анкета после применения итогов сверки.',
        type: PortalQuestionnaireDto,
    })
    questionnaire: PortalQuestionnaireDto;

    @ApiProperty({
        description: 'Итог по каждому проверенному вопросу.',
        type: [QuestionnaireCheckItemDto],
    })
    items: QuestionnaireCheckItemDto[];

    @ApiProperty({
        description:
            'Хотя бы один носитель прочитан урезанным способом ' +
            '(`crm.item.fields`): статусы его вопросов НЕ менялись, ' +
            'обновилась только отметка проверки.',
        type: Boolean,
    })
    degraded: boolean;

    @ApiPropertyOptional({
        description: 'Что именно помешало прочитать поля полностью.',
        type: String,
    })
    error?: string;
}
