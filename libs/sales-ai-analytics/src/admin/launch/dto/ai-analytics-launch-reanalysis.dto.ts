/**
 * Ответ `GET admin/ai-analytics/launch-status`, блок «переразбор
 * истории»: последний прогон по домену (любой период) и день, с которого
 * на портале есть разборы, — начало периода кнопки «посчитать».
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    LaunchReanalysisBlock,
    LaunchReanalysisRun,
} from '../launch.types';
import { AiAnalyticsLaunchBlockDto } from './ai-analytics-launch-status-forecast.dto';

export class AiAnalyticsLaunchReanalysisRunDto implements LaunchReanalysisRun {
    @ApiProperty({
        description: 'Начало периода (YYYY-MM-DD).',
        type: String,
        example: '2026-07-21',
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода (YYYY-MM-DD).',
        type: String,
        example: '2026-10-20',
    })
    to: string;

    @ApiProperty({
        description: 'Подсчёт без вызова модели (dryRun).',
        type: Boolean,
        example: true,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Прогон закончен (все части).',
        type: Boolean,
        example: true,
    })
    finished: boolean;

    @ApiProperty({
        description:
            'Не закончен и давно не обновлялся — цепочка остановилась.',
        type: Boolean,
        example: false,
    })
    stale: boolean;

    @ApiProperty({
        description: 'Номер текущей части цепочки, с 1.',
        type: Number,
        example: 1,
    })
    part: number;

    @ApiProperty({
        description: 'Звонков к переразбору на старте части.',
        type: Number,
        example: 412,
    })
    candidates: number;

    @ApiProperty({
        description: 'Переразобрано всего.',
        type: Number,
        example: 120,
    })
    done: number;

    @ApiProperty({ description: 'Сбоев всего.', type: Number, example: 2 })
    failed: number;

    @ApiProperty({
        description: 'Пропущено при отборе.',
        type: Number,
        example: 30,
    })
    skipped: number;

    @ApiProperty({
        description: 'Потрачено токенов.',
        type: Number,
        example: 1250000,
    })
    tokens: number;

    @ApiProperty({ description: 'Потрачено, ₽.', type: Number, example: 310 })
    price: number;

    @ApiProperty({
        description: 'Когда статус обновлялся (ISO).',
        type: String,
        example: '2026-10-20T10:15:00.000Z',
    })
    updatedAt: string;

    @ApiProperty({
        description: 'Последняя ошибка разбора.',
        type: String,
        nullable: true,
        example: null,
    })
    lastError: string | null;

    @ApiProperty({
        description: 'Оценка токенов (dryRun).',
        type: Number,
        nullable: true,
        example: 4100000,
    })
    estimatedTokens: number | null;

    @ApiProperty({
        description: 'Оценка стоимости, ₽ (dryRun).',
        type: Number,
        nullable: true,
        example: 1020,
    })
    estimatedPrice: number | null;

    @ApiProperty({
        description:
            'Пояснение к оценке (например, «оценки нет: токены раньше не писались»).',
        type: String,
        nullable: true,
        example: null,
    })
    estimateMessage: string | null;

    @ApiProperty({
        description:
            'Доля сделанного 0..1 (после первой части — оценка снизу).',
        type: Number,
        example: 0.29,
    })
    progressShare: number;
}

export class AiAnalyticsLaunchReanalysisDto
    extends AiAnalyticsLaunchBlockDto
    implements LaunchReanalysisBlock
{
    @ApiProperty({
        description:
            'С какого дня на портале есть готовые разборы (YYYY-MM-DD) — ' +
            'начало периода переразбора; null — разборов нет.',
        type: String,
        nullable: true,
        example: '2026-07-21',
    })
    analysisSince: string | null;

    @ApiProperty({
        description:
            'Последний прогон переразбора по любому периоду; null — не было.',
        type: AiAnalyticsLaunchReanalysisRunDto,
        nullable: true,
    })
    run: AiAnalyticsLaunchReanalysisRunDto | null;
}
