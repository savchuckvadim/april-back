import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ALERT_KINDS,
    AiAnalyticsAlertKind,
} from '../constants/ai-analytics.const';
import { MetricDto } from './metric.dto';

/**
 * Сигнальные части строки менеджера, вынесенные из `ai-manager-row.dto.ts`
 * ради лимита «≤ 300 строк»: риск-звонок периода и доля «шаг с датой» за
 * два окна. Реэкспорт из `ai-manager-row.dto` сохраняет прежние импорты.
 */

/**
 * Риск-звонок периода (риск-флаг разбора или срочный коучинг) со ссылкой
 * на карточку разбора: ссылки проставляет OverviewUseCase после сборки
 * строк одним вызовом SmartLinkLoader (withOverviewRiskCallLinks).
 */
export class AiRiskCallDto {
    @ApiProperty({
        description: 'Id транскрипции.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Вид сигнала.',
        enum: AI_ANALYTICS_ALERT_KINDS,
        example: 'promise',
    })
    kind: AiAnalyticsAlertKind;

    @ApiProperty({
        description: 'Начало звонка (ISO 8601).',
        type: String,
        example: '2026-09-03T10:15:00.000Z',
    })
    callStartedAt: string;

    @ApiProperty({
        description:
            'Ссылка на карточку разбора звонка в Битрикс24 (смарт-процесс ' +
            '«AI-анализ звонков»); null — элемент разбора ещё не создан или ' +
            'смарт не установлен.',
        type: String,
        nullable: true,
        example: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    })
    link: string | null;
}

/** Доля «шаг с датой» за два последних окна периода (сигнал next_step_drop). */
export class AiNextStepRateDto {
    @ApiProperty({
        description: 'Окно, дней (по умолчанию 14).',
        type: Number,
        example: 14,
    })
    windowDays: number;

    @ApiProperty({
        description: 'Последнее окно периода: доля 0..1, n, Уилсон 90 %.',
        type: MetricDto,
    })
    current: MetricDto;

    @ApiProperty({
        description:
            'Предыдущее окно (может быть урезано началом периода → малое n).',
        type: MetricDto,
    })
    previous: MetricDto;
}
