import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { AI_DOSSIER_MONTHS } from '../constants/ai-dossier.const';
import {
    AiDossierFeedbackSummaryDto,
    AiDossierMetaDto,
    AiDossierPassportDto,
    AiDossierReasonDto,
    AiDossierRopMarksDto,
    AiDossierSeriesDto,
} from './ai-dossier-parts.dto';
import { AiObjectionCategoryDto } from './ai-objections.dto';
import { AiPlanFactDto } from './ai-plan-fact.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { AiStyleCardDto } from './ai-style-card.dto';
import { AiManagerTrendsDto } from './ai-trend.dto';
import { AiYoyDto } from './ai-yoy.dto';
import { ReadinessDto } from './readiness.dto';

export {
    AiDossierFeedbackSummaryDto,
    AiDossierMetaDto,
    AiDossierPassportDto,
    AiDossierReasonDto,
    AiDossierRopMarksDto,
    AiDossierSeriesDto,
    AiDossierSeriesPointDto,
} from './ai-dossier-parts.dto';

/**
 * Запрос досье менеджера (план Фазы 3, П4): менеджер, окно в месяцах,
 * socketId для WS и принудительный пересчёт. Ручка тяжёлая: ответ
 * приходит конвертом ready/queued/processing.
 */
export class AiDossierRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Bitrix-id менеджера досье. Руководитель видит подчинённых; ' +
            'менеджер — только себя и только при включённой настройке ' +
            'ai_analytics_self_view_enabled, иначе 403.',
        type: String,
        example: '512',
    })
    @IsString()
    @IsNotEmpty()
    managerId: string;

    @ApiPropertyOptional({
        description:
            'Окно досье в месяцах, считая текущий (1..12). По умолчанию 3.',
        type: Number,
        minimum: AI_DOSSIER_MONTHS.min,
        maximum: AI_DOSSIER_MONTHS.max,
        default: AI_DOSSIER_MONTHS.default,
        example: AI_DOSSIER_MONTHS.default,
    })
    @IsOptional()
    @IsInt()
    @Min(AI_DOSSIER_MONTHS.min, {
        message: `months не меньше ${AI_DOSSIER_MONTHS.min}`,
    })
    @Max(AI_DOSSIER_MONTHS.max, {
        message: `months не больше ${AI_DOSSIER_MONTHS.max}`,
    })
    months?: number;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения клиента: по готовности придёт событие ' +
            'ai-analytics:dossier:done (ошибка — ai-analytics:dossier:error).',
        type: String,
        example: 'sock_abc123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Собрать досье заново, игнорируя кэш чтения; результат ' +
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
 * Досье менеджера (план §П4): всё, что витрина знает о человеке за окно.
 * Любой раздел может быть `null` — причина лежит в `reasons[]`, и досье
 * при этом собирается целиком.
 */
export class AiDossierDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера досье.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description: 'Паспорт менеджера; null — см. reasons.',
        type: AiDossierPassportDto,
        nullable: true,
    })
    passport: AiDossierPassportDto | null;

    @ApiProperty({
        description: 'Ряды недель и месяцев; null — см. reasons.',
        type: AiDossierSeriesDto,
        nullable: true,
    })
    series: AiDossierSeriesDto | null;

    @ApiProperty({
        description:
            'Тренды метрик менеджера (поток П1); null — раздел не ' +
            'подключён или данных мало, см. reasons.',
        type: AiManagerTrendsDto,
        nullable: true,
    })
    trends: AiManagerTrendsDto | null;

    @ApiProperty({
        description:
            'Реконсиляция «план — факт» последнего месяца окна (поток П2); ' +
            'null — раздел не подключён, см. reasons.',
        type: AiPlanFactDto,
        nullable: true,
    })
    planFact: AiPlanFactDto | null;

    @ApiProperty({
        description:
            'Сравнение с тем же периодом год назад (поток П3); null — ' +
            'раздел не подключён или сравнивать не с чем, см. reasons.',
        type: AiYoyDto,
        nullable: true,
    })
    yoy: AiYoyDto | null;

    @ApiProperty({
        description:
            'Карточка стиля менеджера; null — профиль отключён сотрудником ' +
            'или данных мало, см. reasons.',
        type: AiStyleCardDto,
        nullable: true,
    })
    style: AiStyleCardDto | null;

    @ApiProperty({
        description:
            'Возражения менеджера за окно по категориям; null — см. reasons.',
        type: [AiObjectionCategoryDto],
        nullable: true,
    })
    objections: AiObjectionCategoryDto[] | null;

    @ApiProperty({
        description: 'Свод обратной связи за окно; null — см. reasons.',
        type: AiDossierFeedbackSummaryDto,
        nullable: true,
    })
    feedbackSummary: AiDossierFeedbackSummaryDto | null;

    @ApiProperty({
        description: 'Метки руководителя за окно; null — см. reasons.',
        type: AiDossierRopMarksDto,
        nullable: true,
    })
    ropMarks: AiDossierRopMarksDto | null;

    @ApiProperty({
        description:
            'Готовность витрины на последний месяц окна; null — модели ' +
            'портала за окно нет, см. reasons.',
        type: ReadinessDto,
        nullable: true,
    })
    readiness: ReadinessDto | null;

    @ApiProperty({
        description:
            'Почему разделы пусты: по одной записи на пустой раздел. ' +
            'Пусто — все разделы собрались.',
        type: [AiDossierReasonDto],
    })
    reasons: AiDossierReasonDto[];

    @ApiProperty({
        description: 'Служебное: версия расчёта, снапшоты и момент сборки.',
        type: AiDossierMetaDto,
    })
    meta: AiDossierMetaDto;
}

/** Конверт ответа ручки досье. */
export class AiDossierResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description:
            'Досье (при status = ready). При queued/processing результат ' +
            'придёт по WS ai-analytics:dossier:done, затем повторить POST.',
        type: AiDossierDto,
    })
    data?: AiDossierDto;
}

/**
 * Payload Bull-джобы SALES_AI_ANALYTICS_DOSSIER (внутренний контракт
 * ручка → процессор, валидаторы не нужны). `months` уже нормализован,
 * requestKey = jobId = ключ кэша досье.
 */
export interface AiDossierJobData {
    domain: string;
    managerId: string;
    /** Месяцы окна YYYY-MM по возрастанию. */
    months: string[];
    requestKey: string;
    socketId?: string;
    /** Кто инициировал (для логов). */
    requesterUserId?: string;
}

/**
 * Запись кэша досье: готовый результат либо конверт ошибки процессора
 * (120 с), чтобы промах не ставил джобу заново сразу после падения.
 */
export type AiDossierCacheEntry =
    | { status: 'ready'; data: AiDossierDto }
    | { status: 'error'; message: string };

/** Payload WS-события ai-analytics:dossier:done (само досье не уходит). */
export interface AiDossierWsDonePayload {
    requestKey: string;
    generatedAt: string;
}

/** Payload WS-события ai-analytics:dossier:error. */
export interface AiDossierWsErrorPayload {
    requestKey: string;
    message: string;
}
