import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { CHECKPOINT_CODE_PATTERN } from '@lib/call-lib/call-report/methodology/methodology.types';
import {
    CALL_BADGE_FAMILIES,
    CALL_BADGE_IDS,
    CALL_BADGE_TONES,
    type CallBadgeFamily,
    type CallBadgeId,
    type CallBadgeTone,
} from '@lib/sales-ai-analytics';
import {
    CALLS_LIST_POINT_STATES,
    type CallsListPointState,
} from '../calls-list.const';
import type {
    CallListBadgeFacet,
    CallListPointFacet,
    CallListPointFilter,
} from '../calls-list.types';

/** Бейдж пункта методики в запросе: код пункта и нужное состояние. */
export class CallsListPointFilterDto implements CallListPointFilter {
    @ApiProperty({
        description:
            'Код пункта методики портала (значение facets.points[].code).',
        type: String,
        maxLength: 64,
        example: 'pres.spirals_min',
    })
    @IsString()
    @MaxLength(64)
    @Matches(CHECKPOINT_CODE_PATTERN, {
        message:
            'Код пункта методики — латиница, цифры и разделители . _ -, с буквы',
    })
    code: string;

    @ApiProperty({
        description:
            'Состояние пункта: done — исполнен, missed — не исполнен. ' +
            'Звонки, где пункт не проверялся или не относится к разговору, ' +
            'не попадают ни в одно из состояний.',
        enum: CALLS_LIST_POINT_STATES,
        example: 'missed',
    })
    @IsString()
    @IsIn(CALLS_LIST_POINT_STATES)
    state: CallsListPointState;
}

/** Бейдж в строке списка: проблема звонка или невыполненный основной пункт методики. */
export class CallsListItemBadgeDto {
    @ApiProperty({
        description:
            'Код бейджа: идентификатор общего бейджа (facets.badges[].id) ' +
            'или «m:» и код пункта методики (m:{facets.points[].code}).',
        type: String,
        example: 'step_missing',
    })
    id: string;

    @ApiProperty({
        description: 'Подпись плашки для человека.',
        type: String,
        example: 'Шаг не назначен',
    })
    title: string;

    @ApiProperty({
        description: 'Тон плашки: bad, warn, neutral или good.',
        enum: CALL_BADGE_TONES,
        example: 'bad',
    })
    tone: CallBadgeTone;
}

/** Значение фасета общих бейджей. */
export class CallsListBadgeFacetDto implements CallListBadgeFacet {
    @ApiProperty({
        description: 'Идентификатор бейджа — значение фильтра badges.',
        enum: CALL_BADGE_IDS,
        example: 'step_missing',
    })
    id: CallBadgeId;

    @ApiProperty({
        description: 'Подпись плашки для человека.',
        type: String,
        example: 'Шаг не назначен',
    })
    title: string;

    @ApiProperty({
        description: 'Подсказка: одно предложение о том, что бейдж значит.',
        type: String,
        example: 'Следующий шаг с клиентом в разговоре не назначен.',
    })
    hint: string;

    @ApiProperty({
        description: 'Тон плашки: bad, warn, neutral или good.',
        enum: CALL_BADGE_TONES,
        example: 'bad',
    })
    tone: CallBadgeTone;

    @ApiProperty({
        description:
            'Семейство бейджа: выбранные бейджи одного семейства (итог ' +
            'разговора) сочетаются по «или»; null — бейдж без семейства, ' +
            'сочетается с остальными по «и».',
        enum: CALL_BADGE_FAMILIES,
        nullable: true,
        example: null,
    })
    family: CallBadgeFamily | null;

    @ApiProperty({
        description:
            'Показывать в строке фильтров сразу; остальные бейджи ' +
            'добавляются выбором из списка.',
        type: Boolean,
        example: true,
    })
    main: boolean;

    @ApiProperty({
        description:
            'С какой даты (ГГГГ-ММ-ДД) разборы несут признак — подсказка «считается ' +
            'с даты»; null — всегда.',
        type: String,
        nullable: true,
        example: '2026-11-06',
    })
    since: string | null;

    @ApiProperty({
        description:
            'Сколько звонков останется, если добавить этот бейдж к выбранным ' +
            'фильтрам (менеджеры, типы, оценка, отзывы, бейджи); для бейджа ' +
            'семейства — если выбрать его вместо выбранных бейджей этого семейства.',
        type: Number,
        example: 12,
    })
    count: number;
}

/** Значение фасета пунктов методики портала. */
export class CallsListPointFacetDto implements CallListPointFacet {
    @ApiProperty({
        description: 'Код пункта методики — значение поля code фильтра points.',
        type: String,
        example: 'pres.spirals_min',
    })
    code: string;

    @ApiProperty({
        description:
            'Короткая подпись плашки (до 28 знаков): название бейджа из ' +
            'методики, а если его нет — формулировка пункта, сокращённая «…».',
        type: String,
        example: 'Спирали презентации',
    })
    label: string;

    @ApiProperty({
        description: 'Полная формулировка пункта методики.',
        type: String,
        example: 'Показал не меньше двух полных спиралей презентации',
    })
    title: string;

    @ApiProperty({
        description:
            'Коды типов звонка, к которым относится пункт (значения фасета callTypes).',
        type: [String],
        example: ['presentation'],
    })
    callTypes: string[];

    @ApiProperty({
        description: 'Показывать в строке фильтров сразу.',
        type: Boolean,
        example: false,
    })
    main: boolean;

    @ApiProperty({
        description:
            'Сколько звонков останется, если выбрать этот пункт «исполнен» ' +
            'при остальных выбранных фильтрах (сам выбранный фильтр по пункту не ' +
            'учитывается).',
        type: Number,
        example: 8,
    })
    done: number;

    @ApiProperty({
        description:
            'Сколько звонков останется, если выбрать этот пункт «не исполнен» ' +
            'при остальных выбранных фильтрах (сам выбранный фильтр по пункту не ' +
            'учитывается).',
        type: Number,
        example: 5,
    })
    missed: number;
}

/** Методика портала, по которой разбираются звонки. */
export class CallsListMethodologyDto {
    @ApiProperty({
        description: 'Код методики портала.',
        type: String,
        example: 'polyansky',
    })
    code: string;

    @ApiProperty({
        description: 'Название методики для людей.',
        type: String,
        example: 'Методика Полянского',
    })
    title: string;
}
