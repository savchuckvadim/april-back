/**
 * Части ответа «Разложение прогноза» (`GET admin/ai-analytics/forecast-
 * breakdown`): открытая сделка (справочно), подбор прогноза от
 * презентаций по отделу и входы расчёта менеджера. Вынесены из
 * `ai-analytics-forecast-breakdown.dto.ts` по лимиту 300 строк.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_ENTRIES,
    AI_FORECAST_FLOW_SOURCES,
    AI_PRESENTATION_FLOW_REASONS,
    AI_PRESENTATION_FLOW_STATUSES,
    type AiForecastEntry,
    type AiForecastFlowSource,
    type PresentationFlowReason,
    type PresentationFlowStatus,
} from '../../model/presentation-flow.types';
import type {
    ForecastBreakdownEpisodeView,
    ForecastBreakdownFlowView,
    ForecastBreakdownManagerFlowView,
} from '../services/ai-analytics-forecast-breakdown.types';

/** Описания слагаемых и метода — общие для отдела и менеджера. */
export const BREAKDOWN_PIPELINE_DESCRIPTION =
    'Ожидаемых продаж до конца месяца от уже сделанного: presentations-v2 — ' +
    'от проведённых презентаций; calls-v1 — от открытых сделок. null — ' +
    'слагаемое не сохранено (запись до 16.11.2026) или истории стадий нет.';
export const BREAKDOWN_NEW_FLOW_DESCRIPTION =
    'Ожидаемых продаж до конца месяца от новой активности: ' +
    'presentations-v2 — от новых презентаций; calls-v1 — от новых встреч ' +
    '(звонков). null — не сохранено (запись до 16.11.2026).';
export const BREAKDOWN_METHOD_DESCRIPTION =
    'Метод расчёта: presentations-v2 — от отмеченных презентаций (с ' +
    '18.11.2026); calls-v1 — старый расчёт по звонкам.';

export class AiForecastBreakdownEpisodeDto
    implements ForecastBreakdownEpisodeView
{
    @ApiProperty({
        description: 'Ключ эпизода сделки; null — у эпизода нет ключа.',
        example: 'deal:90412',
        type: String,
        nullable: true,
    })
    id: string | null;

    @ApiProperty({
        description: 'Сколько дней сделка открыта.',
        example: 34,
        type: Number,
    })
    ageDays: number;

    @ApiProperty({
        description:
            'Вероятность продажи из стадии сделки (0–1); null — не задана.',
        example: 0.42,
        type: Number,
        nullable: true,
    })
    theta: number | null;

    @ApiProperty({
        description: 'Вклад сделки в ожидание: продаж до конца месяца.',
        example: 0.18,
        type: Number,
    })
    expected: number;
}

export class AiForecastBreakdownFlowDto implements ForecastBreakdownFlowView {
    @ApiProperty({
        description:
            'Итог подбора прогноза от презентаций: estimated — сдвиг ' +
            'продажи подобран по истории портала; default-lag — сдвиг по ' +
            'умолчанию; not-applicable — презентации не отмечаются, прогноз ' +
            'от них не строится.',
        enum: AI_PRESENTATION_FLOW_STATUSES,
        example: 'default-lag',
    })
    status: PresentationFlowStatus;

    @ApiProperty({
        description:
            'Почему сдвиг по умолчанию или прогноз не строится; null — ' +
            'причины нет.',
        enum: AI_PRESENTATION_FLOW_REASONS,
        nullable: true,
        example: 'lag-not-identified',
    })
    reason: PresentationFlowReason | null;

    @ApiProperty({
        description:
            'Счётчик презентаций: presentation-uniq — уникальные, ' +
            'presentation — все; null — не записан.',
        enum: AI_FORECAST_ENTRIES,
        nullable: true,
        example: 'presentation-uniq',
    })
    entry: AiForecastEntry | null;

    @ApiProperty({
        description: 'Продаж на презентацию по отделу (0–1).',
        example: 0.03,
        type: Number,
    })
    q: number;

    @ApiProperty({
        description: 'Затухание сдвига продажи по месяцам (0–1).',
        example: 0.5,
        type: Number,
    })
    rho: number;

    @ApiProperty({
        description:
            'Сдвиг продажи подобран по истории портала; false — взят по ' +
            'умолчанию.',
        example: false,
        type: Boolean,
    })
    lagEstimated: boolean;

    @ApiProperty({
        description:
            'Сотрудников, посчитанных по своим продажам: презентации не ' +
            'отмечены.',
        example: 0,
        type: Number,
    })
    salesHistoryManagers: number;
}

export class AiForecastBreakdownManagerFlowDto
    implements ForecastBreakdownManagerFlowView
{
    @ApiProperty({
        description:
            'Откуда ожидание: presentations — от презентаций; ' +
            'sales-history — презентации не отмечены, по своим продажам.',
        enum: AI_FORECAST_FLOW_SOURCES,
        example: 'presentations',
    })
    source: AiForecastFlowSource;

    @ApiProperty({
        description: 'Презентаций с начала месяца.',
        example: 10,
        type: Number,
    })
    presentationsDone: number;

    @ApiProperty({
        description: 'Презентаций в рабочий день до конца месяца.',
        example: 1,
        type: Number,
    })
    presentationsRate: number;

    @ApiProperty({
        description: 'Продаж на презентацию у сотрудника (0–1).',
        example: 0.03,
        type: Number,
    })
    salesPerPresentation: number;

    @ApiProperty({
        description: 'Доля продаж, приходящаяся на месяц презентации (0–1).',
        example: 0.5,
        type: Number,
    })
    sameMonthShare: number;

    @ApiProperty({
        description: 'Доля оставшихся рабочих дней месяца (0–1).',
        example: 0.5,
        type: Number,
    })
    remainingShare: number;

    @ApiProperty({
        description:
            'Презентации прошлых месяцев с весами сдвига — сколько из них ' +
            'ещё приносят продажи в этом месяце.',
        example: 9.9,
        type: Number,
    })
    pastPresentations: number;

    @ApiProperty({
        description:
            'Средние продажи за три прошлых месяца; null — истории нет.',
        example: 0.6,
        type: Number,
        nullable: true,
    })
    salesMean: number | null;
}
