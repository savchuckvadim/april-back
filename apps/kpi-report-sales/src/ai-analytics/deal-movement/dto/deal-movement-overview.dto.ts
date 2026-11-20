import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiAnalyticsEnvelopeDto } from '../../dto/ai-response-envelope.dto';
import { DealMovementHonestyBlockDto } from './deal-movement-honesty.dto';
import { DealMovementMatrixBlockDto } from './deal-movement-matrix.dto';
import { DealMovementStatusesDto } from './deal-movement-statuses.dto';

/** Обзор витрины «Движение сделок» за период. */
export class DealMovementOverviewDto {
    @ApiProperty({
        description: 'Начало периода (YYYY-MM-DD), как в запросе.',
        type: String,
        example: '2026-11-01',
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода (YYYY-MM-DD), как в запросе.',
        type: String,
        example: '2026-11-20',
    })
    to: string;

    @ApiProperty({
        description:
            'Статусы сделок по отделу и менеджерам на последнюю ночь периода ' +
            'и динамика по ночам (сколько и на какую сумму).',
        type: DealMovementStatusesDto,
    })
    statuses: DealMovementStatusesDto;

    @ApiProperty({
        description:
            'Матрица «оценка звонка × продвижение сделки» по разобранным ' +
            'звонкам периода — по отделу и менеджерам.',
        type: DealMovementMatrixBlockDto,
    })
    matrix: DealMovementMatrixBlockDto;

    @ApiProperty({
        description:
            'Честность оценок: доля звонков с продвижением 4–5, после ' +
            'которых стадия сделки не сдвинулась вперёд за N дней.',
        type: DealMovementHonestyBlockDto,
    })
    honesty: DealMovementHonestyBlockDto;
}

/** Конверт ответа обзора. */
export class DealMovementOverviewResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Обзор при status = ready.',
        type: DealMovementOverviewDto,
    })
    data?: DealMovementOverviewDto;
}
