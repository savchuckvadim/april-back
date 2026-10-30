/**
 * DTO ручек `POST admin/ai-analytics/smart-backfill` и
 * `GET admin/ai-analytics/smart-backfill-status`: дописывание полей
 * карточек разборов из сохранённых записей без вызова модели.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
} from 'class-validator';
import {
    SMART_BACKFILL_MODES,
    SMART_BACKFILL_SOURCES,
    type SmartBackfillMode,
    type SmartBackfillRunStatus,
    type SmartBackfillSkipReason,
    type SmartBackfillSource,
} from '../../contracts/smart-backfill.types';
import type {
    SmartBackfillRunResult,
    SmartBackfillStatusResult,
} from '../services/ai-analytics-smart-backfill.service';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

const toBoolean = ({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value;

/** Дата портала YYYY-MM-DD. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Домен, режим и период — общее у запуска и статуса. */
export class AiAnalyticsSmartBackfillKeyDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24, чьи карточки разборов дописывать.',
        example: 'garantservisvoronezh.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiPropertyOptional({
        description:
            'Режим отбора: period — все карточки периода из сохранённых ' +
            'разборов; pending — только те, у которых запись полей не ' +
            'удалась (их же ночью подбирает крон). Не задан — period.',
        example: 'period',
        enum: SMART_BACKFILL_MODES,
    })
    @IsOptional()
    @IsString()
    @IsIn(SMART_BACKFILL_MODES as unknown as string[])
    mode?: SmartBackfillMode;

    @ApiPropertyOptional({
        description:
            'Начало периода по дате записи разбора в поясе портала, ' +
            'YYYY-MM-DD, включительно. Не задано — 30 дней назад.',
        example: '2026-10-13',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(DATE_PATTERN, { message: 'from: ожидается YYYY-MM-DD' })
    from?: string;

    @ApiPropertyOptional({
        description:
            'Конец периода по дате записи разбора в поясе портала, ' +
            'YYYY-MM-DD, включительно. Не задано — сегодня.',
        example: '2026-10-30',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(DATE_PATTERN, { message: 'to: ожидается YYYY-MM-DD' })
    to?: string;
}

/** Запуск дописывания полей карточек. */
export class AiAnalyticsSmartBackfillRunDto extends AiAnalyticsSmartBackfillKeyDto {
    @ApiPropertyOptional({
        description:
            'Карточек на одну часть прогона (1..1000); не задана — значение ' +
            'по умолчанию. Остаток джоба дорабатывает продолжениями сама.',
        example: 150,
        type: Number,
        minimum: 1,
        maximum: 1000,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1000)
    quota?: number;

    @ApiPropertyOptional({
        description:
            'Только подсчёт: сколько карточек будет переписано; Битрикс не ' +
            'вызывается, запись статуса создаётся.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;
}

/** Запрос статуса: домен обязателен, режим и период — чтобы прочитать конкретный прогон. */
export class AiAnalyticsSmartBackfillStatusQueryDto extends AiAnalyticsSmartBackfillKeyDto {
    @ApiPropertyOptional({
        description:
            'Зарезервировано: для совместимости форм запуска и статуса.',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    dryRun?: boolean;
}

/** Ответ запуска. */
export class AiAnalyticsSmartBackfillRunResultDto
    implements SmartBackfillRunResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garantservisvoronezh.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Режим отбора карточек, с которым ушёл прогон.',
        example: 'period',
        enum: SMART_BACKFILL_MODES,
    })
    mode: SmartBackfillMode;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-13',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-30',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Запущен подсчёт (dryRun) или боевой прогон.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Поставлена ли джоба CALL_REPORT_SMART_BACKFILL в очередь CALL_REPORT.',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы первой части (домен, режим, период); null — не поставлена.',
        example:
            'call-report-smart-backfill:garantservisvoronezh.bitrix24.ru:period:2026-10-13:2026-10-30:run:part-1',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Почему не запущено: очередь недоступна или период пустой; null — запущено.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Карточек на часть, с которой уйдёт прогон.',
        example: 150,
        type: Number,
    })
    quota: number;
}

/** Статус прогона дописывания (запись call-report-smart-backfill-run). */
export class AiAnalyticsSmartBackfillRunStatusDto
    implements SmartBackfillRunStatus
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garantservisvoronezh.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Режим отбора карточек.',
        example: 'period',
        enum: SMART_BACKFILL_MODES,
    })
    mode: SmartBackfillMode;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-13',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода, YYYY-MM-DD.',
        example: '2026-10-30',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Прогон был только подсчётом.',
        example: false,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description: 'Кто поставил прогон: кнопка админки или ночной крон.',
        example: 'admin',
        enum: SMART_BACKFILL_SOURCES,
    })
    source: SmartBackfillSource;

    @ApiProperty({
        description: 'Номер последней части цепочки продолжений.',
        example: 1,
        type: Number,
    })
    part: number;

    @ApiProperty({
        description:
            'Записей разбора в окне всего (кандидаты на запись плюс пропущенные).',
        example: 430,
        type: Number,
    })
    candidates: number;

    @ApiProperty({
        description: 'Карточек, в которые поля записаны, с начала прогона.',
        example: 410,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: 'Карточек, у которых запись полей снова не удалась.',
        example: 2,
        type: Number,
    })
    failed: number;

    @ApiProperty({
        description:
            'Записей, чей элемент смарта на портале не найден (удалён).',
        example: 1,
        type: Number,
    })
    missing: number;

    @ApiProperty({
        description: 'Пропущено записей всего (сумма причин ниже).',
        example: 17,
        type: Number,
    })
    skipped: number;

    @ApiProperty({
        description:
            'Пропуски по причинам: noSmartItem — у записи нет элемента, ' +
            'superseded — запись замещена переразбором, noPayload — в записи ' +
            'нет разбора.',
        example: { noSmartItem: 12, superseded: 5, noPayload: 0 },
        type: Object,
    })
    skippedBy: Record<SmartBackfillSkipReason, number>;

    @ApiProperty({
        description: 'Начало прогона (первой части), ISO.',
        example: '2026-10-30T09:00:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Последнее обновление статуса, ISO.',
        example: '2026-10-30T09:35:00.000Z',
        type: String,
    })
    updatedAt: string;

    @ApiProperty({
        description: 'Прогон закончен (продолжений не будет).',
        example: true,
        type: Boolean,
    })
    finished: boolean;

    @ApiProperty({
        description: 'Текст последней ошибки записи; null — ошибок не было.',
        example: null,
        type: String,
        nullable: true,
    })
    lastError: string | null;

    @ApiProperty({
        description:
            'Часть остановлена по бюджету времени, остаток — продолжению.',
        example: false,
        type: Boolean,
    })
    timeBudgetHit: boolean;

    @ApiProperty({
        description:
            'Идентификатор поставленного продолжения; null — не нужно.',
        example: null,
        type: String,
        nullable: true,
    })
    continuedWith: string | null;
}

/** Ответ статуса. */
export class AiAnalyticsSmartBackfillStatusDto
    implements SmartBackfillStatusResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garantservisvoronezh.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Прогон запрошенного режима и периода; null — его не было или ' +
            'режим с периодом не заданы.',
        type: AiAnalyticsSmartBackfillRunStatusDto,
        nullable: true,
    })
    run: AiAnalyticsSmartBackfillRunStatusDto | null;

    @ApiProperty({
        description:
            'Самый свежий прогон домена по любому ключу; null — прогонов не было.',
        type: AiAnalyticsSmartBackfillRunStatusDto,
        nullable: true,
    })
    latest: AiAnalyticsSmartBackfillRunStatusDto | null;

    @ApiProperty({
        description:
            'Карточек с элементом, у которых поля разбора ещё не записаны, ' +
            'за окно крона.',
        example: 3,
        type: Number,
    })
    pending: number;

    @ApiProperty({
        description: 'Окно подсчёта ожидающих карточек, дней назад от сегодня.',
        example: 30,
        type: Number,
    })
    pendingLookbackDays: number;

    @ApiProperty({
        description: 'Очередь подключена — запуск возможен.',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Подсказка по порядку действий словами.',
        example: 'Сначала dryRun — покажет число карточек.',
        type: String,
    })
    hint: string;
}
