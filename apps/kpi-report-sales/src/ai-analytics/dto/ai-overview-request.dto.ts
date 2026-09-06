import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Min,
} from 'class-validator';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { IsOverviewPeriod } from './validators/overview-period.validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Фильтры обзора (план 6.2, ТЗ FR-13): период в TZ портала не длиннее
 * 3 месяцев, менеджеры (по умолчанию — весь ростер ОП), confirmedOnly,
 * socketId для WS-ответа очереди, forceRefresh для пересчёта.
 * Общая часть запросов overview / attention / by-type.
 */
export class AiOverviewFiltersDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Начало периода (YYYY-MM-DD, TZ портала), включительно. По ' +
            'умолчанию фронт берёт скользящие 4 недели.',
        type: String,
        example: '2026-08-10',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'from должен быть в формате YYYY-MM-DD' })
    from: string;

    @ApiProperty({
        description:
            'Конец периода (YYYY-MM-DD, TZ портала), включительно. Период ' +
            'не длиннее 3 месяцев и from ≤ to.',
        type: String,
        example: '2026-09-06',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'to должен быть в формате YYYY-MM-DD' })
    @IsOverviewPeriod()
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджеров. Пусто — весь ростер отделов продаж по ' +
            'структуре. Список нормализуется (дедуп, сортировка) и входит в ' +
            'ключ результата.',
        type: [Number],
        example: [447, 512],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsInt({ each: true })
    @Min(1, { each: true })
    managerIds?: number[];

    @ApiPropertyOptional({
        description:
            'Только подтверждённые события (сшивка разбора с самоотчётом). ' +
            'В Фазе 1b принимается и входит в ключ результата, но фильтрация ' +
            'не применяется — сшивка по сделке появится в Фазе 3.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    confirmedOnly?: boolean;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения клиента: при расчёте в очереди результат ' +
            'придёт событием ai-analytics:overview:done (ошибка — ' +
            'ai-analytics:overview:error).',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать обзор, игнорируя кэш чтения. Свежий результат ' +
            'перезапишет кэш (write-through). Идущий расчёт не дублируется.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Запрос обзора менеджер × тип (очередь + WS). */
export class AiOverviewRequestDto extends AiOverviewFiltersDto {}

/**
 * Payload Bull-джобы SALES_AI_ANALYTICS_OVERVIEW (внутренний контракт
 * контроллер/прогрев → процессор, валидаторы не нужны). managerIds —
 * уже нормализованный ростер; requestKey — ключ кэша и jobId.
 */
export interface AiOverviewJobData {
    domain: string;
    from: string;
    to: string;
    managerIds: number[];
    confirmedOnly: boolean;
    forceRefresh: boolean;
    requestKey: string;
    socketId?: string;
    /** Кто инициировал (для логов); у прогрева отсутствует. */
    requesterUserId?: string;
}
