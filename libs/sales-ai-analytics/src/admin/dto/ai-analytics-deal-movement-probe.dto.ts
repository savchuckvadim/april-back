/**
 * DTO ручек проверки записи в ленту (движение сделок, 17.11.2026):
 * `POST admin/ai-analytics/deal-movement-probe` ставит проверку одной
 * сделки, `GET admin/ai-analytics/deal-movement-probe` отдаёт её итог.
 * Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import {
    DEAL_MOVEMENT_PROBE_PHASES,
    type DealMovementProbeMoments,
    type DealMovementProbePhase,
    type DealMovementProbeResult,
} from '../../contracts/deal-movement-probe.types';
import type {
    DealMovementProbeRunResult,
    DealMovementProbeStatusResult,
} from '../services/ai-analytics-deal-movement-probe.service';
import { AiAnalyticsDealMovementDomainDto } from './ai-analytics-deal-movement.dto';

/** Запуск проверки: портал и сделка. */
export class AiAnalyticsDealMovementProbeDto extends AiAnalyticsDealMovementDomainDto {
    @ApiProperty({
        description:
            'Номер открытой сделки воронки «ОП Основная» этого портала. В неё ' +
            'будут записаны служебная запись журнала и комментарий ' +
            '«Проверка записи в ленту — служебная, можно удалить».',
        example: 9041,
        type: Number,
        minimum: 1,
    })
    @IsInt({ message: 'dealId — целое число' })
    @Min(1, { message: 'dealId — номер сделки, больше нуля' })
    dealId: number;
}

/** Запрос итога — домен портала. */
export class AiAnalyticsDealMovementProbeQueryDto extends AiAnalyticsDealMovementDomainDto {}

/** Ответ постановки проверки. */
export class AiAnalyticsDealMovementProbeRunResultDto
    implements DealMovementProbeRunResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({ description: 'Номер сделки.', example: 9041, type: Number })
    dealId: number;

    @ApiProperty({
        description: 'Поставлена ли проверка в очередь event-sales.',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы (одна на портал); null — очереди нет.',
        example: 'garant.bitrix24.ru:deal-movement:probe',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description:
            'Почему не поставлена: очереди нет или проверка портала уже ждёт ' +
            'либо идёт; null — поставлена.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;
}

/** «Последняя активность» сделки до и после каждой записи. */
export class AiAnalyticsDealMovementProbeMomentsDto
    implements DealMovementProbeMoments
{
    @ApiProperty({
        description: 'Последняя активность до записей, ISO; null — пусто.',
        example: '2026-11-17T08:12:00.000Z',
        type: String,
        nullable: true,
    })
    before: string | null;

    @ApiProperty({
        description: 'После служебной записи журнала, ISO.',
        example: '2026-11-17T10:00:05.000Z',
        type: String,
        nullable: true,
    })
    afterLogMessage: string | null;

    @ApiProperty({
        description: 'После комментария, ISO.',
        example: '2026-11-17T10:00:11.000Z',
        type: String,
        nullable: true,
    })
    afterComment: string | null;

    @ApiProperty({
        description: 'Когда ушла служебная запись (наши часы), ISO.',
        example: '2026-11-17T10:00:04.000Z',
        type: String,
        nullable: true,
    })
    logMessageAt: string | null;

    @ApiProperty({
        description: 'Когда ушёл комментарий (наши часы), ISO.',
        example: '2026-11-17T10:00:10.000Z',
        type: String,
        nullable: true,
    })
    commentAt: string | null;
}

/** Итог проверки. */
export class AiAnalyticsDealMovementProbeResultDto
    implements DealMovementProbeResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({ description: 'Номер сделки.', example: 9041, type: Number })
    dealId: number;

    @ApiProperty({
        description:
            'Чем закончилась: running — идёт, done — готово, refused — сделка ' +
            'не подходит (записей нет), failed — сбой.',
        enum: DEAL_MOVEMENT_PROBE_PHASES,
        example: 'done',
        type: String,
    })
    phase: DealMovementProbePhase;

    @ApiProperty({
        description: 'Начало проверки, ISO.',
        example: '2026-11-17T10:00:00.000Z',
        type: String,
    })
    startedAt: string;

    @ApiProperty({
        description: 'Конец проверки, ISO; null — ещё идёт.',
        example: '2026-11-17T10:00:12.000Z',
        type: String,
        nullable: true,
    })
    finishedAt: string | null;

    @ApiProperty({
        description: 'Последняя активность сделки до и после каждой записи.',
        type: AiAnalyticsDealMovementProbeMomentsDto,
    })
    moments: AiAnalyticsDealMovementProbeMomentsDto;

    @ApiProperty({
        description:
            'Сдвигает ли служебная запись последнюю активность; null — не дошли.',
        example: false,
        type: Boolean,
        nullable: true,
    })
    logMessageShifts: boolean | null;

    @ApiProperty({
        description:
            'Сдвигает ли комментарий последнюю активность; null — не дошли.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    commentShifts: boolean | null;

    @ApiProperty({
        description: 'Выводы словами, по-русски.',
        example: [
            'Служебная запись журнала не сдвигает «последнюю активность» сделки.',
        ],
        type: [String],
    })
    conclusions: string[];

    @ApiProperty({
        description: 'Отказ или сбой словами; null — проверка прошла.',
        example: null,
        type: String,
        nullable: true,
    })
    error: string | null;
}

/** Итог проверки портала и идёт ли она сейчас. */
export class AiAnalyticsDealMovementProbeStatusDto
    implements DealMovementProbeStatusResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Проверка ждёт очереди или идёт.',
        example: false,
        type: Boolean,
    })
    pending: boolean;

    @ApiProperty({
        description:
            'Итог последней проверки; null — проверок не было или итог истёк (14 суток).',
        type: AiAnalyticsDealMovementProbeResultDto,
        nullable: true,
    })
    result: AiAnalyticsDealMovementProbeResultDto | null;
}
