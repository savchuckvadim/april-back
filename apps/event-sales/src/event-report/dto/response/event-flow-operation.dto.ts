import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventSalesFlowResponseDto } from './event-sales-flow-response.dto';

/**
 * Состояние операции отправки отчёта.
 *
 * Отчёт — команда, а не запрос: повторный POST не должен выполнить её второй
 * раз. Поэтому у операции есть собственный идентификатор и живущий отдельно
 * от очереди статус — по нему клиент узнаёт исход, даже если потерял сокет
 * или перезагрузил страницу.
 */
export enum EnumEventFlowStatus {
    /** Принято, ждёт воркера. */
    QUEUED = 'queued',
    /** Воркер выполняет batch Битрикса. */
    RUNNING = 'running',
    /** Batch отправлен в Битрикс. */
    DONE = 'done',
    /** Операция упала; `error` объясняет чем. */
    FAILED = 'failed',
}

export class EventFlowOperationDto {
    @ApiProperty({
        description:
            'Идентификатор операции. Его же клиент присылает при повторной ' +
            'отправке — операция не выполнится дважды.',
        type: String,
        example: '0f2b7d0e-2a1e-4a63-9a0a-9f1f2a3b4c5d',
    })
    operationId: string;

    @ApiProperty({
        description: 'Текущее состояние операции.',
        enum: EnumEventFlowStatus,
        example: EnumEventFlowStatus.QUEUED,
    })
    status: EnumEventFlowStatus;

    @ApiProperty({
        description: 'Когда операция принята (ISO 8601).',
        type: String,
        example: '2026-08-04T10:15:00.000Z',
    })
    queuedAt: string;

    @ApiPropertyOptional({
        description: 'Когда воркер взял операцию в работу (ISO 8601).',
        type: String,
        nullable: true,
    })
    startedAt?: string | null;

    @ApiPropertyOptional({
        description: 'Когда операция завершилась — успехом или падением.',
        type: String,
        nullable: true,
    })
    finishedAt?: string | null;

    @ApiPropertyOptional({
        description: 'Результат выполнения flow. Заполнен при статусе `done`.',
        type: EventSalesFlowResponseDto,
        nullable: true,
    })
    result?: EventSalesFlowResponseDto | null;

    @ApiPropertyOptional({
        description: 'Текст ошибки. Заполнен при статусе `failed`.',
        type: String,
        nullable: true,
    })
    error?: string | null;
}
