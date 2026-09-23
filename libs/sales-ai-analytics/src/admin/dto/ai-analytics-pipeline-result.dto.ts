/**
 * Ответы ручек ручного запуска конвейера (план Фазы 3, П5): поставленная
 * джоба пересчёта и план догона. Классы повторяют результаты
 * `services/ai-analytics-pipeline-admin.service.ts` — расхождение формы
 * ловит компилятор через `implements`.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
    AI_ANALYTICS_ADMIN_RHYTHMS,
    AiAnalyticsAdminRhythm,
} from '../ai-analytics-admin.const';
import type {
    BackfillResult,
    DispatchedJob,
    RecomputeResult,
} from '../services/ai-analytics-pipeline-admin.service';

/** Поставленная джоба конвейера. */
export class AiAnalyticsDispatchedJobDto implements DispatchedJob {
    @ApiProperty({
        description:
            'Идентификатор джобы в Bull: ai-analytics:snapshot:{ритм}:' +
            '{домен}:{ключ}. Повтор с тем же id очередь игнорирует, ' +
            'поэтому у ручного пересчёта ключ несёт метку момента.',
        example:
            'ai-analytics:snapshot:monthly:april.bitrix24.ru:2026-08:recompute:1758542400000',
        type: String,
    })
    jobId: string;

    @ApiProperty({
        description:
            'Ключ периода джобы: месяц YYYY-MM, ISO-неделя YYYY-Www или ' +
            'день YYYY-MM-DD (у пересчёта — с суффиксом recompute).',
        example: '2026-08:recompute:1758542400000',
        type: String,
    })
    key: string;

    @ApiProperty({
        description: 'Ритм, которым пойдёт прогон в воркере.',
        example: 'monthly',
        type: String,
        enum: AI_ANALYTICS_ADMIN_RHYTHMS,
    })
    rhythm: AiAnalyticsAdminRhythm;
}

/** Ответ POST admin/ai-analytics/recompute. */
export class AiAnalyticsRecomputeResultDto implements RecomputeResult {
    @ApiProperty({
        description: 'Домен портала, по которому поставлен пересчёт.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Поставленная джоба пересчёта (одна на запрос).',
        type: AiAnalyticsDispatchedJobDto,
    })
    job: AiAnalyticsDispatchedJobDto;

    @ApiProperty({
        description:
            'Признак принудительного пересчёта: джоба идёт с ' +
            'forceRefresh = true, поэтому уже посчитанные периоды ' +
            'переписываются, а прошлые версии становятся superseded.',
        example: true,
        type: Boolean,
    })
    forceRefresh: true;
}

/** Ответ POST admin/ai-analytics/backfill: оценка объёма и джобы. */
export class AiAnalyticsBackfillResultDto implements BackfillResult {
    @ApiProperty({
        description: 'Домен портала, по которому запрошен догон истории.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Месяцы диапазона YYYY-MM, по одной джобе на месяц — это и ' +
            'есть оценка объёма запроса.',
        example: ['2026-01', '2026-02', '2026-03'],
        type: [String],
    })
    monthKeys: string[];

    @ApiProperty({
        description:
            'Поставленные джобы догона. Пусто при отказе (см. reason).',
        type: [AiAnalyticsDispatchedJobDto],
    })
    jobs: AiAnalyticsDispatchedJobDto[];

    @ApiProperty({
        description:
            'Почему джобы не поставлены: backfill-empty-range — диапазон ' +
            'пуст или перевёрнут, backfill-range-too-wide — больше 24 ' +
            'месяцев за раз. null — всё поставлено.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;
}
