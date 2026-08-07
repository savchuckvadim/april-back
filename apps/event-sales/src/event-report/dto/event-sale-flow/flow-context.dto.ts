import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Откуда открыто приложение. Значения совпадают с фронтовым `APP_FROM_ENUM`
 * (apps/event-sales/modules/app/model/slice/AppSlice.ts) — это один контракт.
 */
export enum EEvFlowFrom {
    COMPANY = 'company',
    LEAD = 'lead',
    DEAL = 'deal',
    TASK = 'task',
    CALL_CARD = 'call_card',
}

/**
 * Честный контекст встройки: кто владелец события и какие сущности вокруг.
 *
 * Заменяет трюк с поддельным `CRM_COMPANY_DETAIL_TAB`-placement: фронт больше
 * не обязан выдавать сделку или задачу за компанию, чтобы бэк понял владельца.
 * Приоритет владельца при резолве: companyId → dealId → leadId — компания
 * остаётся самым широким контекстом, сделка без компании и чистый лид
 * становятся легальными сценариями, а не ошибками.
 */
export class EvFlowContextDto {
    @ApiProperty({
        description: 'Тип встройки, из которой пришло событие.',
        enum: EEvFlowFrom,
        example: EEvFlowFrom.DEAL,
    })
    @IsEnum(EEvFlowFrom)
    from: EEvFlowFrom;

    @ApiPropertyOptional({
        description: 'Компания клиента, если она известна.',
        type: Number,
        example: 431,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    companyId?: number;

    @ApiPropertyOptional({
        description: 'Сделка-владелец события (кейс «сделка без компании»).',
        type: Number,
        example: 5512,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    dealId?: number;

    @ApiPropertyOptional({
        description: 'Лид-владелец события (холодная база, лид без компании).',
        type: Number,
        example: 318051,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    leadId?: number;

    @ApiPropertyOptional({
        description: 'Задача, из которой открыта встройка (from=task).',
        type: Number,
        example: 777,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    taskId?: number;
}
