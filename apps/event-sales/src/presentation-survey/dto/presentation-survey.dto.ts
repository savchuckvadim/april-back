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
 */
export const PRESENTATION_SURVEY_VALUE_MAX_LENGTH = 5000;

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
            'Лид (заявка) — единственная цель, куда пишутся ДЕВЯТЬ ' +
            'детальных полей «5К» вместе со сводными.',
        type: Number,
        example: 42,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description: 'Сделки (пишутся только сводные поля).',
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
            'серверный whitelist). Пишутся ТОЛЬКО в лид.',
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
