import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
    EnumSalesHookCode,
    SALES_HOOK_CODE_VALUES,
} from '../constants/sales-hook-code.enum';
import { EnumSalesHookSource } from '../contracts/sales-hook-job.type';

/** Статусы операции sales-хука. */
export enum EnumSalesHookOperationStatus {
    QUEUED = 'queued',
    RUNNING = 'running',
    DONE = 'done',
    FAILED = 'failed',
}

export const SALES_HOOK_OPERATION_STATUS_VALUES = Object.values(
    EnumSalesHookOperationStatus,
);

export const SALES_HOOK_SOURCE_VALUES = Object.values(EnumSalesHookSource);

/**
 * Базовое состояние операции sales-хука. Конкретные хуки наследуют DTO
 * и добавляют типизированное поле result.
 */
export class SalesHookOperationDto {
    @ApiProperty({
        description:
            'Идентификатор операции. По нему фрейм поллит статус и ' +
            'дедуплицируются повторные запросы.',
        example: '3a1f0c9e-6b1d-4b8e-9a71-2f6d2c1e5a10',
        type: String,
    })
    @IsString()
    operationId: string;

    @ApiProperty({
        description: 'Код хука, которому принадлежит операция.',
        example: 'lead-to-work',
        type: String,
        enum: SALES_HOOK_CODE_VALUES,
    })
    @IsString()
    @IsIn(SALES_HOOK_CODE_VALUES as unknown as string[])
    hook: EnumSalesHookCode;

    @ApiProperty({
        description: 'Домен портала Bitrix, на котором выполняется операция.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description:
            'Источник запуска: robot — вебхук робота Битрикс (через ' +
            'silence-дебаунс), frame — кнопка во фрейме.',
        example: 'frame',
        type: String,
        enum: SALES_HOOK_SOURCE_VALUES,
    })
    @IsString()
    @IsIn(SALES_HOOK_SOURCE_VALUES as unknown as string[])
    source: EnumSalesHookSource;

    @ApiProperty({
        description: 'Текущий статус операции.',
        example: 'queued',
        type: String,
        enum: SALES_HOOK_OPERATION_STATUS_VALUES,
    })
    @IsString()
    @IsIn(SALES_HOOK_OPERATION_STATUS_VALUES as unknown as string[])
    status: EnumSalesHookOperationStatus;

    @ApiProperty({
        description: 'Число элементов в пачке (кнопка — 1, робот — N).',
        example: 1,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    itemsCount: number;

    @ApiProperty({
        description: 'ISO-время постановки в очередь.',
        example: '2026-08-05T12:00:00.000Z',
        type: String,
    })
    @IsString()
    queuedAt: string;

    @ApiPropertyOptional({
        description: 'ISO-время начала выполнения; null, пока в очереди.',
        example: '2026-08-05T12:00:01.000Z',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    startedAt: string | null;

    @ApiPropertyOptional({
        description: 'ISO-время завершения (done или failed).',
        example: '2026-08-05T12:00:05.000Z',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    finishedAt: string | null;

    @ApiPropertyOptional({
        description:
            'Текст ошибки при статусе failed. Код `duplicate_in_progress` — ' +
            'та же сущность уже обрабатывается параллельной операцией.',
        example: null,
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    error: string | null;

    @ApiPropertyOptional({
        description:
            'Результат выполнения хука. Тип уточняется в наследниках ' +
            'DTO конкретного хука; до завершения — null.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    result: unknown;
}
