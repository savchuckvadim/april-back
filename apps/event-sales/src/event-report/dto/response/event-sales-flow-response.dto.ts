import { ApiProperty } from '@nestjs/swagger';

/**
 * Результат обработки event-sales flow.
 *
 * Возвращается эндпоинтом `POST /event-sales/flow` после того, как все
 * batch-команды отправлены в Bitrix одним HTTP-вызовом.
 */
export class EventSalesFlowResponseDto {
    @ApiProperty({
        description:
            'Признак успешного выполнения flow. `true`, если все batch-команды ' +
            'были сформированы и отправлены в Bitrix без ошибок.',
        type: Boolean,
        example: true,
    })
    success: boolean;

    @ApiProperty({
        description:
            'Количество batch-команд, фактически отправленных в Bitrix ' +
            '(сумма прямых команд и команд KPI-буфера).',
        type: Number,
        example: 17,
    })
    commandsCount: number;

    @ApiProperty({
        description:
            'Тип сущности Bitrix, по которой выполнялся flow (например, `deal` или `lead`).',
        type: String,
        example: 'deal',
    })
    entityType: string;

    @ApiProperty({
        description:
            'Идентификатор сущности Bitrix, по которой выполнялся flow.',
        type: Number,
        example: 1024,
    })
    entityId: number;
}
