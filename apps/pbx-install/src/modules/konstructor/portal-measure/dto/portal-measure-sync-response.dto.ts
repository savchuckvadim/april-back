import { ApiProperty } from '@nestjs/swagger';

/** Результат синхронизации портальных единиц измерения с глобальными. */
export class PortalMeasureSyncResponseDto {
    @ApiProperty({
        description: 'Сколько portal_measure создано в этом прогоне',
        example: 3,
        type: Number,
    })
    created: number;

    @ApiProperty({
        description:
            'Сколько portal_measure уже существовало (обновлены из глобальной measure)',
        example: 5,
        type: Number,
    })
    updated: number;

    @ApiProperty({
        description:
            'Итоговое число portal_measure у портала после синхронизации',
        example: 8,
        type: Number,
    })
    total: number;
}
