/**
 * Ответ `GET admin/ai-analytics/launch-status`, часть 1: настройки, смарт,
 * журнал прогонов и корень ответа. Прогноз и расход — в
 * `ai-analytics-launch-status-forecast.dto.ts`, переразбор — в
 * `ai-analytics-launch-reanalysis.dto.ts`.
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    LaunchPipelineBlock,
    LaunchRunRef,
    LaunchSettingsBlock,
    LaunchSmartBlock,
    LaunchStatus,
} from '../launch.types';
import { AiAnalyticsLaunchReanalysisDto } from './ai-analytics-launch-reanalysis.dto';
import {
    AiAnalyticsLaunchBlockDto,
    AiAnalyticsLaunchCostDto,
    AiAnalyticsLaunchForecastDto,
} from './ai-analytics-launch-status-forecast.dto';

export class AiAnalyticsLaunchSettingsDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchSettingsBlock
{
    @ApiProperty({
        description:
            'AI-аналитика ОП включена (kpiSales, ai_analytics_enabled); null — не прочитано.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    aiAnalyticsEnabled: boolean | null;

    @ApiProperty({
        description:
            'Разбор звонков включён в настройках AI портала; null — на портале ' +
            'не задано (действуют общие настройки сервера) или не прочитано.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    callAnalysisEnabled: boolean | null;

    @ApiProperty({
        description:
            'Сотрудников в пилоте (allowedUserIds); null — пилот не задан.',
        type: Number,
        nullable: true,
        example: 3,
    })
    pilotSize: number | null;
}

export class AiAnalyticsLaunchSmartDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchSmartBlock
{
    @ApiProperty({
        description:
            'Смарт «AI-анализ звонков» найден; null — проверить не удалось.',
        type: Boolean,
        nullable: true,
        example: true,
    })
    installed: boolean | null;

    @ApiProperty({
        description:
            'Есть значение риск-флага «После отказа не оставил дверь открытой».',
        type: Boolean,
        nullable: true,
        example: false,
    })
    doorClosed: boolean | null;

    @ApiProperty({
        description: 'Есть тип звонка «Приглашение на мероприятие».',
        type: Boolean,
        nullable: true,
        example: false,
    })
    eventInvite: boolean | null;

    @ApiProperty({
        description:
            'Чего не хватает по const-конфигу: «КОД_ПОЛЯ: код значения», а ' +
            'если поля нет совсем — «КОД_ПОЛЯ».',
        type: [String],
        example: ['RISK_FLAGS: door_closed', 'CALL_TYPE: event_invite'],
    })
    missingValues: string[];
}

export class AiAnalyticsLaunchRunRefDto implements LaunchRunRef {
    @ApiProperty({
        description:
            'День прогона (YYYY-MM-DD; у догона — последний день месяца).',
        type: String,
        example: '2026-09-30',
    })
    day: string;

    @ApiProperty({
        description: 'Ритм: nightly, weekly, monthly или backfill.',
        type: String,
        example: 'backfill',
    })
    rhythm: string;

    @ApiProperty({
        description: 'Итог: ok, partial или failed.',
        type: String,
        example: 'ok',
    })
    status: string;

    @ApiProperty({
        description: 'Когда записан журнал (ISO, UTC).',
        type: String,
        example: '2026-10-20T23:10:00.000Z',
    })
    generatedAt: string;
}

export class AiAnalyticsLaunchPipelineDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchPipelineBlock
{
    @ApiProperty({
        description: 'Последний прогон догона истории; null — не было.',
        type: AiAnalyticsLaunchRunRefDto,
        nullable: true,
    })
    lastBackfill: AiAnalyticsLaunchRunRefDto | null;

    @ApiProperty({
        description: 'Последний месячный прогон; null — не было.',
        type: AiAnalyticsLaunchRunRefDto,
        nullable: true,
    })
    lastMonthly: AiAnalyticsLaunchRunRefDto | null;

    @ApiProperty({
        description: 'Последний ночной прогон; null — не было.',
        type: AiAnalyticsLaunchRunRefDto,
        nullable: true,
    })
    lastNightly: AiAnalyticsLaunchRunRefDto | null;

    @ApiProperty({
        description:
            'Разных месяцев, посчитанных догоном за окно журнала (60 дней).',
        type: Number,
        example: 18,
    })
    backfillMonths: number;

    @ApiProperty({
        description: 'Сколько месяцев догоняет кнопка.',
        type: Number,
        example: 24,
    })
    backfillMonthsTarget: number;

    @ApiProperty({
        description:
            'Догон идёт (последний прогон свежее трёх часов, месяцев меньше цели).',
        type: Boolean,
        example: true,
    })
    backfillRunning: boolean;
}

export class AiAnalyticsLaunchStatusDto implements LaunchStatus {
    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        example: 'gsr.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Момент сборки сводки (ISO, UTC).',
        type: String,
        example: '2026-10-21T09:00:00.000Z',
    })
    checkedAt: string;

    @ApiProperty({
        description: 'Включена ли AI-аналитика и разбор звонков, пилот.',
        type: AiAnalyticsLaunchSettingsDto,
    })
    settings: AiAnalyticsLaunchSettingsDto;

    @ApiProperty({
        description: 'Смарт «AI-анализ звонков» и новые значения перечислений.',
        type: AiAnalyticsLaunchSmartDto,
    })
    smart: AiAnalyticsLaunchSmartDto;

    @ApiProperty({
        description: 'Журнал прогонов: догон истории, месячный и ночной.',
        type: AiAnalyticsLaunchPipelineDto,
    })
    pipeline: AiAnalyticsLaunchPipelineDto;

    @ApiProperty({
        description: 'Прогноз: проверка точности и флаг показа.',
        type: AiAnalyticsLaunchForecastDto,
    })
    forecast: AiAnalyticsLaunchForecastDto;

    @ApiProperty({
        description: 'Переразбор истории: последний прогон и прогресс.',
        type: AiAnalyticsLaunchReanalysisDto,
    })
    reanalysis: AiAnalyticsLaunchReanalysisDto;

    @ApiProperty({
        description: 'Расход модели за текущий месяц.',
        type: AiAnalyticsLaunchCostDto,
    })
    cost: AiAnalyticsLaunchCostDto;
}
