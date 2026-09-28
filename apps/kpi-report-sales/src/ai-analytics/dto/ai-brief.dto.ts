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
import {
    AiBriefBulletDto,
    AiBriefPreviousPeriodDto,
    AiBriefUsageDto,
} from './ai-brief-parts.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { IsOverviewPeriod } from './validators/overview-period.validator';

// Части резюме (буллет, расход, прошлый период) вынесены в
// ai-brief-parts.dto.ts («≤ 300 строк»); реэкспорт сохраняет прежние импорты.
export {
    AiBriefBulletDto,
    AiBriefPreviousPeriodDto,
    AiBriefUsageDto,
} from './ai-brief-parts.dto';

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

/**
 * AI-резюме периода (план §5.2, версия 2 «что изменилось и что делать»):
 * заголовок — самое сильное изменение, буллеты трёх групп (изменения к
 * прошлому периоду той же длины, фокус на менеджерах, действия недели).
 */
export class AiBriefDto {
    @ApiProperty({
        description:
            'Заголовок резюме, до 140 символов: самое сильное изменение ' +
            'одной фразой. Когда сравнения с прошлым периодом нет или ' +
            'ничего не изменилось — сводка за период словами.',
        type: String,
        example:
            'Сигналов риска за период: 68 — вдвое больше, чем за прошлый ' +
            'период (31)',
    })
    headline: string;

    @ApiProperty({
        description:
            'Пункты резюме (до 10: изменения ≤ 4, фокус ≤ 3, действия ≤ 3) ' +
            'в порядке групп change, focus, action. Действия всегда ' +
            'выводятся правилами из фактов пакета — нейросеть их не пишет.',
        type: [AiBriefBulletDto],
    })
    bullets: AiBriefBulletDto[];

    @ApiProperty({
        description:
            'Тон резюме: calm — спокойно, attention — требует внимания, ' +
            'alarm — есть сигналы риска.',
        enum: AI_BRIEF_TONES,
        example: 'attention',
    })
    tone: AiBriefTone;

    @ApiProperty({
        description:
            'Источник: llm — изменения и фокус написала нейросеть, ответ ' +
            'прошёл проверку фактов; template — резюме собрано по шаблону ' +
            'из фактов пакета (см. reason).',
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
        description:
            'Есть сравнение с прошлым периодом той же длины: хотя бы один ' +
            'факт сравнён с ним. false — прошлый период несопоставим, ' +
            'данных за него нет или расчёт не готов; тогда ни у одного ' +
            'пункта нет изменения (delta = null), а первым пунктом ' +
            'изменений идёт фраза о причине.',
        type: Boolean,
        example: true,
    })
    comparable: boolean;

    @ApiProperty({
        description:
            'Прошлый период сравнения (YYYY-MM-DD, TZ портала) той же ' +
            'длины, примыкающий к периоду резюме; null — сравнения нет.',
        type: AiBriefPreviousPeriodDto,
        nullable: true,
    })
    previousPeriod: AiBriefPreviousPeriodDto | null;

    @ApiProperty({
        description: 'Момент сборки резюме (ISO 8601, UTC).',
        type: String,
        example: '2026-09-08T06:15:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description:
            'Версия промпта резюме (входит в ключ кэша; смена рвёт ' +
            'сравнимость резюме между периодами).',
        type: String,
        example: 'brief-2.0.0',
    })
    promptVersion: string;

    @ApiPropertyOptional({
        description:
            'Подпись причины шаблона: к порталу не подключена нейросеть, ' +
            'исчерпана квота, ответ не разобрался, провалена проверка ' +
            'фактов; null — резюме от нейросети.',
        type: String,
        nullable: true,
        example:
            'Резюме собрано по шаблону: к порталу не подключена нейросеть.',
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
 * нормализованный периметр; requestKey = jobId = ключ кэша резюме по
 * пакету ручки (джоба кладёт результат ещё и под ключ своего пакета — с
 * обзорами периода и прошлого периода).
 */
export interface AiBriefJobData {
    domain: string;
    from: string;
    to: string;
    managerIds: number[];
    requestKey: string;
    packHash: string;
    /**
     * Просили собрать заново: готовое резюме такого же пакета из кэша не
     * берётся, нейросеть зовётся снова.
     */
    forceRefresh?: boolean;
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
