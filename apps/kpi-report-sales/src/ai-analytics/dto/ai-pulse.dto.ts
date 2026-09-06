import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { XmrState } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_ALERT_KINDS,
    AiAnalyticsAlertKind,
} from '../constants/ai-analytics.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { MetricDto } from './metric.dto';

const XMR_STATES: readonly XmrState[] = ['in', 'above', 'below', 'run'];

/** Запрос пульса дисциплины. */
export class AiPulseRequestDto extends AiRequestBaseDto {}

export class AiPulseWindowDto {
    @ApiProperty({
        description: 'Первый рабочий день окна (YYYY-MM-DD, TZ портала).',
        type: String,
        example: '2026-08-31',
    })
    from: string;

    @ApiProperty({
        description: 'Последний рабочий день окна (YYYY-MM-DD).',
        type: String,
        example: '2026-09-04',
    })
    to: string;

    @ApiProperty({
        description: 'Рабочие дни окна по календарю портала.',
        type: [String],
        example: ['2026-08-31', '2026-09-01', '2026-09-02'],
    })
    workdays: string[];
}

/** Контрольные границы XmR по дневным долям истории (25 рабочих дней). */
export class AiPulseXmrDto {
    @ApiProperty({
        description: 'Центр (среднее дневных долей).',
        type: Number,
    })
    center: number;

    @ApiProperty({
        description: 'Верхняя граница (центр + 2,66·MR̄).',
        type: Number,
    })
    ucl: number;

    @ApiProperty({
        description: 'Нижняя граница (центр − 2,66·MR̄).',
        type: Number,
    })
    lcl: number;

    @ApiProperty({
        description:
            'Состояние по последней точке: in — в границах; above/below — ' +
            'выход за границу; run — серия по одну сторону от центра.',
        enum: XMR_STATES,
        example: 'in',
    })
    state: XmrState;
}

export class AiPulseManagerDto {
    @ApiProperty({ description: 'Bitrix-id менеджера.', type: String })
    managerId: string;

    @ApiProperty({
        description: 'Разобранных звонков менеджера в окне (n ≥ 20).',
        type: Number,
        example: 24,
    })
    analyzed: number;

    @ApiProperty({
        description: 'Доля звонков с назначенным шагом и датой.',
        type: MetricDto,
    })
    nextStepDateRate: MetricDto;
}

/** Звонок окна с сигналом руководителю (риск-флаг или срочный коучинг). */
export class AiPulseAlertDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера; null — менеджер не определён.',
        type: String,
        nullable: true,
    })
    managerId: string | null;

    @ApiProperty({ description: 'Id транскрипции звонка.', type: String })
    transcriptionId: string;

    @ApiProperty({
        description:
            'Вид сигнала: риск-флаг разбора (promise/conflict/compliance/' +
            'client_negative) либо urgent — срочный приоритет коучинга.',
        enum: AI_ANALYTICS_ALERT_KINDS,
        example: 'promise',
    })
    kind: AiAnalyticsAlertKind;

    @ApiProperty({
        description:
            'Цитата из разбора (возражение или худший раздел); может быть пустой.',
        type: String,
    })
    quote: string;

    @ApiProperty({
        description: 'Начало звонка (ISO 8601).',
        type: String,
        example: '2026-09-03T10:15:00.000Z',
    })
    callStartedAt: string;

    @ApiProperty({
        description:
            'Отработан ли сигнал (есть feedback kind = alert_handled).',
        type: Boolean,
    })
    handled: boolean;
}

/** Пульс дисциплины «следующий шаг с датой» за 5 рабочих дней (план, 6.3). */
export class AiPulseDto {
    @ApiProperty({
        description:
            'Последний день окна — вчерашний рабочий день (YYYY-MM-DD).',
        type: String,
        example: '2026-09-04',
    })
    periodDate: string;

    @ApiProperty({ description: 'Окно рабочих дней.', type: AiPulseWindowDto })
    window: AiPulseWindowDto;

    @ApiProperty({
        description:
            'Доля разобранных звонков окна с назначенным шагом и датой.',
        type: MetricDto,
    })
    nextStepDateRate: MetricDto;

    @ApiProperty({
        description:
            'XmR-границы по дневным долям; null — меньше 3 дней с разборами.',
        type: AiPulseXmrDto,
        nullable: true,
    })
    xmr: AiPulseXmrDto | null;

    @ApiProperty({ description: 'Разобранных звонков в окне.', type: Number })
    analyzedCalls: number;

    @ApiProperty({
        description:
            'Доля коротких звонков (< 300 с) среди всех звонков окна, %.',
        type: Number,
        example: 37.5,
    })
    shortCallsSharePct: number;

    @ApiProperty({
        description: "Менеджеры с n ≥ 20 в периметре requester'а.",
        type: [AiPulseManagerDto],
    })
    byManager: AiPulseManagerDto[];

    @ApiProperty({
        description:
            "Сигналы руководителю по звонкам окна в периметре requester'а.",
        type: [AiPulseAlertDto],
    })
    alerts: AiPulseAlertDto[];
}

export class AiPulseResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Пульс (при status = ready).',
        type: AiPulseDto,
    })
    data?: AiPulseDto;
}
