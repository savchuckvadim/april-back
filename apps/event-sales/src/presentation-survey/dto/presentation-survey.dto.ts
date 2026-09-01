import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Максимальная длина одного строкового значения анкеты. Значения ДЛИННЕЕ
 * не отклоняются, а обрезаются на сервере (легаси-фронт не должен получать
 * 400 из-за длинного ответа менеджера).
 *
 * Живёт в общем модуле `shared/presentation-survey` — одна анкета, один
 * лимит и для этой ручки, и для ответов в payload отчёта.
 */
export { PRESENTATION_SURVEY_VALUE_MAX_LENGTH } from '../../shared/presentation-survey';

/** Кому записать ответы анкеты. Все цели опциональны. */
export class PresentationSurveyTargetsDto {
    @ApiPropertyOptional({
        description: 'Компания клиента (пишутся только сводные поля).',
        type: Number,
        example: 7,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Лид (заявка): девять детальных «5К», шесть «Разговора» ' +
            'и сводные.',
        type: Number,
        example: 42,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description:
            'Сделки — тот же состав, что у лида: детальные «5К», ' +
            '«Разговор» и сводные (решение 31.08; неустановленное на ' +
            'сделке поле молча пропускается).',
        type: [Number],
        example: [1024, 2048],
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Min(1, { each: true })
    dealIds?: number[];
}

/** Значения анкеты. Пустой объект — валидный no-op. */
export class PresentationSurveyValuesDto {
    @ApiPropertyOptional({
        description:
            'Сводный «Хвост» — что дожимать после презентации ' +
            '(op_presentation_xvost). Длиннее 5000 символов — обрезается.',
        type: String,
        example: 'Дожать по хвосту через неделю',
    })
    @IsOptional()
    @IsString()
    xvost?: string;

    @ApiPropertyOptional({
        description:
            'Детальные ответы «5К»: ключ — код поля (op_5k_client_what, ' +
            'op_5k_client_ready, op_5k_client_price, op_5k_company_who, ' +
            'op_5k_company_how, op_5k_company_right, op_5k_command, ' +
            'op_5k_concurent, op_5k_criteri), значение — ответ менеджера. ' +
            'Ключи вне этого списка молча отбрасываются (жёсткий ' +
            'серверный whitelist). Пишутся в лид и сделки.',
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
            'op_talk_boss_readiness), значение — ответ менеджера. ' +
            'Тот же жёсткий whitelist, что у «5К»; пишутся в лид и ' +
            'сделки. Без этого блока ответы «Разговора» жили только ' +
            'строкой в комментарии — и снимку смарта было нечего читать.',
        type: Object,
        example: {
            op_talk_impression: 'Встретили хорошо, слушали внимательно',
            op_talk_price_opinion: 'Дорого, но готовы обсуждать',
        },
    })
    @IsOptional()
    @IsObject()
    talk?: Record<string, string>;

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
}

/**
 * Анкета после презентации от ЛЕГАСИ-фронта (старый React event-sales):
 * хвост и «5К» отдельным запросом, вне event-report flow.
 *
 * Новый фронт этот контракт не использует — он кладёт ТЕ ЖЕ значения в
 * payload отчёта (`presentation.survey`, класс
 * `PresentationSurveyAnswersDto`): формы и семантика совпадают намеренно,
 * whitelist кодов и нормализация у них общие
 * (`shared/presentation-survey`). Удалить вместе со старым фронтом.
 *
 * Семантика записи — ТОЛЬКО перезапись (append нет): повтор того же
 * payload даёт тот же результат, это и есть ключ идемпотентности.
 */
export class PresentationSurveyDto {
    @ApiProperty({
        description: 'Домен портала Bitrix.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Идентификатор операции (uuid) — для логов и дедупликации: ' +
            'повтор с тем же operationId в течение 24ч не пишется второй раз.',
        example: 'e1c1a1f0-0000-4000-8000-000000000001',
        type: String,
    })
    @IsUUID()
    operationId: string;

    @ApiProperty({
        description: 'Кому записать ответы.',
        type: PresentationSurveyTargetsDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => PresentationSurveyTargetsDto)
    targets: PresentationSurveyTargetsDto;

    @ApiProperty({
        description: 'Значения анкеты (пустые — no-op).',
        type: PresentationSurveyValuesDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => PresentationSurveyValuesDto)
    values: PresentationSurveyValuesDto;
}

/**
 * Сигнал от hook: «создана unplanned-сделка презентации» — БЕЗ значений
 * опросника (значения приходят от легаси-фронта в основную ручку; Nest
 * женит их через Redis-rendezvous в любом порядке прибытия).
 */
export class UnplannedPresentationSignalDto {
    @ApiProperty({
        description: 'Домен портала Bitrix.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'Созданная unplanned-сделка презентации.',
        example: 900,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    unplannedDealId: number;

    @ApiPropertyOptional({
        description: 'Базовая сделка ОП — первый ключ поиска значений.',
        example: 1024,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    baseDealId?: number;

    @ApiPropertyOptional({
        description: 'Лид (заявка) — третий ключ поиска значений.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description: 'Компания — второй ключ поиска значений.',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;
}

/** Итог обработки сигнала. */
export class UnplannedSignalResultDto {
    @ApiProperty({
        description: 'Сигнал принят.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    accepted: boolean;

    @ApiProperty({
        description:
            'Повтор сигнала — запись в эту unplanned-сделку уже выполнялась.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    deduplicated: boolean;

    @ApiProperty({
        description: 'Значения опросника найдены и записаны.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    matched: boolean;

    @ApiProperty({
        description:
            'Значений ещё нет (сигнал обогнал опросник) — сигнал ждёт до ' +
            'часа, опросник допишет сводные сам.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    pending: boolean;

    @ApiProperty({
        description: 'Куда записано (deal_900).',
        example: ['deal_900'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    updated: string[];

    @ApiProperty({
        description: 'Предупреждения мягкой деградации.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Итог приёма анкеты. */
export class PresentationSurveyResultDto {
    @ApiProperty({
        description: 'Запрос принят и обработан.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    accepted: boolean;

    @ApiProperty({
        description:
            'Повтор operationId — запись уже выполнялась, второй раз не писали.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    deduplicated: boolean;

    @ApiProperty({
        description:
            'Ничего не записано: значения пустые либо все поля вне whitelist.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    noop: boolean;

    @ApiProperty({
        description:
            'Сущности, в которые ушла запись (lead_42, deal_1024, company_7).',
        example: ['lead_42', 'deal_1024'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    updated: string[];

    @ApiProperty({
        description:
            'Предупреждения мягкой деградации (неустановленные поля и т.п.).',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}
