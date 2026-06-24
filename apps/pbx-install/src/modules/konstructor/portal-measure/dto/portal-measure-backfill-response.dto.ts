import { ApiProperty } from '@nestjs/swagger';
import { PortalMeasureBackfillResult } from '@lib/portal-lib/konstructor';

/**
 * Результат ремонта таймстампов `portal_measure`: сколько строк с `NULL`
 * было заполнено в этом прогоне.
 */
export class PortalMeasureBackfillResponseDto
    implements PortalMeasureBackfillResult
{
    @ApiProperty({
        description:
            'Сколько строк portal_measure получили created_at (ранее был NULL)',
        example: 12,
        type: Number,
    })
    createdAtFilled: number;

    @ApiProperty({
        description:
            'Сколько строк portal_measure получили updated_at (ранее был NULL)',
        example: 12,
        type: Number,
    })
    updatedAtFilled: number;

    constructor(result: PortalMeasureBackfillResult) {
        this.createdAtFilled = result.createdAtFilled;
        this.updatedAtFilled = result.updatedAtFilled;
    }
}
