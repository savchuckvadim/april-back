import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const STATUSES = ['queued', 'running', 'done', 'failed'] as const;

export class HookOperationDto {
    @ApiProperty({
        description: 'Идентификатор операции.',
        example: '3a1f0c9e-6b1d-4b8e-9a71-2f6d2c1e5a10',
    })
    operationId: string;

    @ApiProperty({ description: 'Код хука.', example: 'lead-to-work' })
    hook: string;

    @ApiProperty({ description: 'Домен портала.' })
    domain: string;

    @ApiProperty({
        description: 'Источник: robot (вебхук) или frame (кнопка).',
        example: 'robot',
    })
    source: string;

    @ApiProperty({ description: 'Статус операции.', enum: STATUSES })
    status: (typeof STATUSES)[number];

    @ApiProperty({ description: 'Число элементов в пачке.', example: 1 })
    itemsCount: number;

    @ApiProperty({ description: 'ISO-время постановки в очередь.' })
    queuedAt: string;

    @ApiPropertyOptional({ description: 'ISO-время начала.', nullable: true })
    startedAt: string | null;

    @ApiPropertyOptional({
        description: 'ISO-время завершения.',
        nullable: true,
    })
    finishedAt: string | null;

    @ApiPropertyOptional({
        description: 'Текст ошибки (failed).',
        nullable: true,
    })
    error: string | null;

    @ApiPropertyOptional({
        description: 'Сколько предупреждений в результате.',
        nullable: true,
    })
    warningsCount: number | null;

    @ApiPropertyOptional({
        description: 'Короткая выжимка результата.',
        nullable: true,
    })
    resultSummary: string | null;

    @ApiPropertyOptional({
        description: 'Когда запись обновлялась в кэше.',
        nullable: true,
    })
    updatedAt: string | null;
}

export class HookOperationsByHookDto {
    @ApiProperty({ description: 'Код хука.' })
    hook: string;

    @ApiProperty({ description: 'Всего операций в окне.' })
    total: number;

    @ApiProperty({ description: 'Из них с ошибкой.' })
    failed: number;

    @ApiProperty({ description: 'Из них в очереди или выполняются.' })
    running: number;

    @ApiPropertyOptional({
        description: 'Последняя активность (ISO).',
        nullable: true,
    })
    lastAt: string | null;
}

export class HookOperationsSummaryDto {
    @ApiProperty() total: number;
    @ApiProperty() queued: number;
    @ApiProperty() running: number;
    @ApiProperty() done: number;
    @ApiProperty() failed: number;

    @ApiProperty({ type: [HookOperationsByHookDto] })
    byHook: HookOperationsByHookDto[];

    @ApiPropertyOptional({
        description: 'Последняя активность по всем хукам (ISO).',
        nullable: true,
    })
    lastActivityAt: string | null;
}

export class PortalHookOperationsResponseDto {
    @ApiProperty({ description: 'Id портала.' })
    portalId: number;

    @ApiProperty({ description: 'Домен портала.' })
    domain: string;

    @ApiProperty({
        description:
            'Пояснение окна наблюдения: статусы операций живут в кэше час и чистятся раз в час.',
    })
    windowNote: string;

    @ApiProperty({ type: HookOperationsSummaryDto })
    summary: HookOperationsSummaryDto;

    @ApiProperty({ type: [HookOperationDto] })
    operations: HookOperationDto[];
}
