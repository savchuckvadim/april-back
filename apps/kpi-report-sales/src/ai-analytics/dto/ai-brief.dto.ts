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
import {
    AI_BRIEF_SOURCES,
    AI_BRIEF_TONES,
    type AiBriefSource,
    type AiBriefTone,
} from '@lib/sales-ai-analytics';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { IsOverviewPeriod } from './validators/overview-period.validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Запрос AI-резюме периода (план Фазы 2, §5.2): период в TZ портала,
 * менеджеры периметра, socketId для WS и принудительный пересчёт.
 * Ручка тяжёлая: ответ приходит конвертом ready/queued/processing.
 */
export class AiBriefRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Начало периода резюме (YYYY-MM-DD, TZ портала), включительно.',
        type: String,
        example: '2026-09-01',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'from должен быть в формате YYYY-MM-DD' })
    from: string;

    @ApiProperty({
        description:
            'Конец периода резюме (YYYY-MM-DD, TZ портала), включительно. ' +
            'Период не длиннее 3 месяцев и from ≤ to.',
        type: String,
        example: '2026-09-07',
    })
    @IsString()
    @Matches(DATE_PATTERN, { message: 'to должен быть в формате YYYY-MM-DD' })
    @IsOverviewPeriod()
    to: string;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджеров резюме. Пусто — весь периметр requester’а. ' +
            'Каждый id проверяется на видимость: чужой менеджер — 403.',
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
            'ID WebSocket-соединения клиента: по готовности придёт событие ' +
            'ai-analytics:brief:done (ошибка — ai-analytics:brief:error).',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Собрать резюме заново, игнорируя кэш чтения; результат ' +
            'перезапишет кэш. Идущий расчёт не дублируется.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Буллет резюме: текст, адресат и ссылки на факты пакета. */
export class AiBriefBulletDto {
    @ApiProperty({
        description: 'Текст буллета, не длиннее 30 слов; числа — из пакета.',
        type: String,
        example: 'Дисциплина CRM ниже нормы: шаг с датой в 42,0 % звонков.',
    })
    text: string;

    @ApiPropertyOptional({
        description: 'Bitrix-id менеджера буллета; нет — буллет про отдел.',
        type: String,
        example: '512',
    })
    managerId?: string;

    @ApiPropertyOptional({
        description: 'Код AI-типа звонка, если буллет про тип.',
        type: String,
        example: 'call',
    })
    callType?: string;

    @ApiProperty({
        description:
            'Коды фактов пакета, на которых стоит буллет (alerts, ' +
            'funnel_gap, discipline_next_step, …).',
        type: [String],
        example: ['discipline_next_step'],
    })
    factRefs: string[];
}

/** Расход вызова модели: токены, цена и признак оценки. */
export class AiBriefUsageDto {
    @ApiProperty({
        description:
            'Токенов вызова; null — модель не вызывали (шаблон без LLM).',
        type: Number,
        nullable: true,
        example: 1240,
    })
    tokens: number | null;

    @ApiProperty({
        description:
            'Стоимость вызова, ₽ = токены / 1000 × llm_price_per_1k; ' +
            'null — модель не вызывали.',
        type: Number,
        nullable: true,
        example: 1.86,
    })
    price: number | null;

    @ApiProperty({
        description:
            'Токены и цена — оценка: провайдер не вернул usage (считали по ' +
            'длине текста) либо цена 1 000 токенов не задана (0 в реестре).',
        type: Boolean,
        example: false,
    })
    estimated: boolean;
}

/** AI-резюме периода (план §5.2). */
export class AiBriefDto {
    @ApiProperty({
        description: 'Заголовок резюме, до 140 символов.',
        type: String,
        example: 'Сводка отдела продаж за 2026-09-01 — 2026-09-07',
    })
    headline: string;

    @ApiProperty({
        description: 'Буллеты резюме (до 5), прошедшие факт-чек.',
        type: [AiBriefBulletDto],
    })
    bullets: AiBriefBulletDto[];

    @ApiProperty({
        description:
            'Тон резюме: calm — спокойно, attention — требует внимания, ' +
            'alarm — есть алерты.',
        enum: AI_BRIEF_TONES,
        example: 'attention',
    })
    tone: AiBriefTone;

    @ApiProperty({
        description:
            'Источник: llm — ответ модели прошёл факт-чек; template — ' +
            'шаблон по фактам пакета (см. reason).',
        enum: AI_BRIEF_SOURCES,
        example: 'llm',
    })
    source: AiBriefSource;

    @ApiProperty({
        description: 'sha256 пакета фактов: ключ кэша и ключ снапшота резюме.',
        type: String,
        example:
            'a3f1c0d9b2e84f7a6c5d4e3b2a1908f7e6d5c4b3a2918f7e6d5c4b3a29180f7e',
    })
    packHash: string;

    @ApiProperty({
        description: 'Момент сборки резюме (ISO 8601, UTC).',
        type: String,
        example: '2026-09-08T06:15:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Версия промпта резюме (смена рвёт сравнимость).',
        type: String,
        example: 'brief-1.0.0',
    })
    promptVersion: string;

    @ApiPropertyOptional({
        description:
            'Подпись причины шаблона: нет ключа VibeCode, исчерпана квота, ' +
            'ответ не разобрался, провален факт-чек; null — резюме от модели.',
        type: String,
        nullable: true,
        example:
            'Резюме собрано по шаблону: у портала не заведён ключ VibeCode.',
    })
    reason?: string | null;

    @ApiPropertyOptional({
        description: 'Расход вызова модели; нет — вызова не было.',
        type: AiBriefUsageDto,
    })
    usage?: AiBriefUsageDto;
}

/** Конверт ответа ручки резюме. */
export class AiBriefResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description:
            'Резюме (при status = ready). При queued/processing результат ' +
            'придёт по WS ai-analytics:brief:done, затем повторить POST.',
        type: AiBriefDto,
    })
    data?: AiBriefDto;
}

/**
 * Payload Bull-джобы SALES_AI_ANALYTICS_BRIEF (внутренний контракт
 * ручка → процессор, валидаторы не нужны; план §5.3). managerIds — уже
 * нормализованный периметр; requestKey = jobId = ключ кэша резюме.
 */
export interface AiBriefJobData {
    domain: string;
    from: string;
    to: string;
    managerIds: number[];
    requestKey: string;
    packHash: string;
    socketId?: string;
    /** Кто инициировал (для логов и квоты). */
    requesterUserId?: string;
}

/**
 * Запись кэша резюме: готовый результат либо конверт ошибки процессора
 * (120 с), чтобы промах не ставил джобу заново сразу после падения.
 */
export type AiBriefCacheEntry =
    | { status: 'ready'; data: AiBriefDto }
    | { status: 'error'; message: string };

/**
 * Payload WS-события ai-analytics:brief:done. Само резюме по WS не
 * уходит — фронт повторяет POST по requestKey (периметр применяет ручка).
 */
export interface AiBriefWsDonePayload {
    requestKey: string;
    generatedAt: string;
}

/** Payload WS-события ai-analytics:brief:error. */
export interface AiBriefWsErrorPayload {
    requestKey: string;
    message: string;
}
