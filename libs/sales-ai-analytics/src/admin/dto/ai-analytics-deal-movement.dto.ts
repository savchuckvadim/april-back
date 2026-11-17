/**
 * DTO ручки `POST admin/ai-analytics/deal-movement` (этап 7.3): прогон
 * движения сделок портала — «Посчитать» или внеочередной ночной счёт —
 * и ответ постановки в очередь. Состояние — `ai-analytics-deal-movement-status.dto.ts`.
 * Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import type { DealMovementRunResult } from '../services/ai-analytics-deal-movement.service';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Домен портала — общее у запуска и состояния. */
export class AiAnalyticsDealMovementDomainDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чьи открытые сделки считать.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Запуск прогона движения сделок. */
export class AiAnalyticsDealMovementRunDto extends AiAnalyticsDealMovementDomainDto {
    @ApiProperty({
        description:
            'true — «Посчитать»: статусы считаются, но ничего не ' +
            'сохраняется, итог только в состоянии прогона и в Telegram. ' +
            'false — внеочередной ночной счёт: состояние по сделкам и снимок ' +
            'дня сохраняются, сегодняшнюю ночь крон не повторит. В сделки ' +
            'не пишется ничего в обоих режимах.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    dryRun: boolean;
}

/** Ответ постановки прогона. */
export class AiAnalyticsDealMovementRunResultDto
    implements DealMovementRunResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Поставлен подсчёт без сохранения (true) или счёт.',
        example: true,
        type: Boolean,
    })
    dryRun: boolean;

    @ApiProperty({
        description:
            'Поставлен ли прогон в очередь event-sales ' +
            '(EVENT_SALES_DEAL_MOVEMENT_RUN).',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description: 'Идентификатор джобы (домен и режим); null — очереди нет.',
        example: 'garant.bitrix24.ru:deal-movement:dry-run',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Почему не поставлен: очереди нет или прогон портала уже ждёт ' +
            'либо идёт; null — поставлен.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;
}
