/**
 * DTO ручки `POST admin/ai-analytics/period-digest` (этап 7.4): подсчёт
 * итогов недели или месяца по менеджерам в очереди event-sales и ответ
 * постановки. Состояние — `ai-analytics-period-digest-status.dto.ts`.
 * Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { DIGEST_PERIOD_KIND } from '../../model/period-digest/period-digest.codes';
import type { DigestPeriodKind } from '../../model/period-digest/period-digest.types';
import type { PeriodDigestRunResult } from '../services/ai-analytics-period-digest.service';

const KINDS: readonly DigestPeriodKind[] = Object.values(DIGEST_PERIOD_KIND);

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value;

/** Домен портала — общее у запуска и состояния. */
export class AiAnalyticsPeriodDigestDomainDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24, по чьим менеджерам считать итоги.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Подсчёт итогов периода. */
export class AiAnalyticsPeriodDigestRunDto extends AiAnalyticsPeriodDigestDomainDto {
    @ApiProperty({
        description: 'Вид периода: week — неделя, month — месяц.',
        enum: KINDS,
        example: DIGEST_PERIOD_KIND.month,
    })
    @IsIn(KINDS, { message: 'kind — week или month' })
    kind: DigestPeriodKind;

    @ApiPropertyOptional({
        description:
            'Ключ периода: неделя — «2026-W46», месяц — «2026-10». Не указан ' +
            '— последняя закрытая неделя или месяц по времени портала.',
        example: '2026-10',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Transform(trim)
    @Matches(/^\d{4}-(W\d{2}|\d{2})$/, {
        message: 'periodKey — «2026-W46» для недели или «2026-10» для месяца',
    })
    periodKey?: string;
}

/** Ответ постановки подсчёта. */
export class AiAnalyticsPeriodDigestRunResultDto
    implements PeriodDigestRunResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Вид периода.',
        enum: KINDS,
        example: DIGEST_PERIOD_KIND.month,
    })
    kind: DigestPeriodKind;

    @ApiProperty({
        description: 'Запрошенный ключ периода; null — последний закрытый.',
        example: '2026-10',
        type: String,
        nullable: true,
    })
    periodKey: string | null;

    @ApiProperty({
        description:
            'Поставлен ли подсчёт в очередь event-sales ' +
            '(EVENT_SALES_PERIOD_DIGEST_RUN).',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description: 'Идентификатор джобы (домен и вид); null — очереди нет.',
        example: 'garant.bitrix24.ru:period-digest:month',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Почему не поставлен: очереди нет или подсчёт этого вида уже ' +
            'ждёт либо идёт; null — поставлен.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;
}
