import { Type } from 'class-transformer';
import {
    ValidateNested,
    IsNumber,
    IsBoolean,
    IsObject,
    IsOptional,
    IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresentationCountDto {
    @ApiProperty({
        description: 'Количество презентаций, привязанных к компании.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    company: number;

    @ApiProperty({
        description: 'Количество презентаций, привязанных к смарт-процессу.',
        type: Number,
        example: 1,
    })
    @IsNumber()
    smart: number;

    @ApiProperty({
        description: 'Количество презентаций, привязанных к сделке.',
        type: Number,
        example: 3,
    })
    @IsNumber()
    deal: number;
}

/**
 * Ответы анкеты «5К/Хвост» — ВМЕСТЕ С ОТЧЁТОМ.
 *
 * Опросник после презентации — такой же ответ при отчёте, как и портальные
 * анкеты смартов (`questionnaireAnswers`), поэтому и едет он так же: в
 * payload. Значения раскладывает основной поток — в лид, сделки и компанию
 * тем же батчем, что и сам отчёт; смарты и презентационные сделки берут их
 * ОТСЮДА, а не перечитывают сущности. Это снимает целый класс ловушек:
 * «анкету отправили после отчёта — снимок пуст», «во встройке в сделку
 * лида нет — зеркало читает пустоту», «три писателя одного значения
 * разъехались».
 *
 * Формы и семантика — ТЕ ЖЕ, что у `values` легаси-ручки
 * `/event-sales/presentation-survey` (`PresentationSurveyValuesDto`): один
 * смысл — один формат. Ключи вне жёсткого серверного whitelist
 * (`shared/presentation-survey`) молча отбрасываются, значения длиннее
 * лимита обрезаются.
 */
export class PresentationSurveyAnswersDto {
    @ApiPropertyOptional({
        description:
            'Сводный «Хвост» — о чём договорились после презентации ' +
            '(op_presentation_xvost). Длиннее 5000 символов — обрезается.',
        type: String,
        example: 'Дожать по хвосту через неделю',
    })
    @IsOptional()
    @IsString()
    xvost?: string;

    @ApiPropertyOptional({
        description:
            'Сводка «Пять К» одним текстом (op_presentation_5k). ' +
            'Длиннее 5000 символов — обрезается.',
        type: String,
        example: 'Клиент готов, решает директор, сравнивают с Консультантом',
    })
    @IsOptional()
    @IsString()
    fiveKSummary?: string;

    @ApiPropertyOptional({
        description:
            'Детальные ответы «5К»: ключ — код поля (op_5k_client_what, ' +
            'op_5k_client_ready, op_5k_client_price, op_5k_company_who, ' +
            'op_5k_company_how, op_5k_company_right, op_5k_command, ' +
            'op_5k_concurent, op_5k_criteri), значение — ответ менеджера. ' +
            'Ключи вне этого списка молча отбрасываются. Пишутся в лид и ' +
            'сделки (контекстную/базовую и презентационные).',
        type: Object,
        example: {
            op_5k_client_what: 'Хочет замену Консультанта',
            op_5k_criteri: 'Цена и скорость обновлений',
        },
    })
    @IsOptional()
    @IsObject()
    fiveK?: Record<string, string>;

    @ApiPropertyOptional({
        description:
            'Шесть вопросов «Разговора»: ключ — код поля ' +
            '(op_talk_impression, op_talk_remembered, op_talk_desire, ' +
            'op_talk_decision_process, op_talk_price_opinion, ' +
            'op_talk_boss_readiness), значение — ответ менеджера. Тот же ' +
            'whitelist и те же цели записи, что у «5К».',
        type: Object,
        example: {
            op_talk_impression: 'Встретили хорошо, слушали внимательно',
            op_talk_price_opinion: 'Дорого, но готовы обсуждать',
        },
    })
    @IsOptional()
    @IsObject()
    talk?: Record<string, string>;
}

export class PresentationDto {
    @ApiProperty({
        description: 'Счётчики презентаций по типам привязки.',
        type: PresentationCountDto,
    })
    @ValidateNested()
    @Type(() => PresentationCountDto)
    count: PresentationCountDto;

    @ApiProperty({
        description: 'Признак того, что презентация была проведена.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isPresentationDone: boolean;

    @ApiProperty({
        description: 'Признак внеплановой (незапланированной) презентации.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isUnplannedPresentation: boolean;

    @ApiPropertyOptional({
        description:
            'Ответы анкеты «5К/Хвост» после презентации. Поле НЕ прислано ' +
            '— прежнее поведение: старые сборки фрейма шлют анкету ' +
            'отдельным запросом в легаси-ручку ' +
            '`/event-sales/presentation-survey`, и поток ведёт себя ровно ' +
            'как раньше (ни одной новой команды).',
        type: PresentationSurveyAnswersDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => PresentationSurveyAnswersDto)
    survey?: PresentationSurveyAnswersDto;
}
