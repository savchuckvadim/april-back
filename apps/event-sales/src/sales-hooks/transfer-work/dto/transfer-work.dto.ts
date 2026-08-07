import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    Min,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/**
 * Тело передачи работы: компания и/или набор сделок + новый ответственный.
 * Используется и для «отдать» (/give), и для «забрать» (/take) — различие
 * путей нужно для будущего разделения прав по действию.
 */
export class TransferWorkRunDto extends SalesHookRunRequestBaseDto {
    @ApiPropertyOptional({
        description:
            'Компания, чья работа передаётся (со всеми открытыми сделками ' +
            'наших воронок). Обязательна, если не переданы dealIds.',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Явный набор передаваемых сделок. Обязателен, если не передана ' +
            'companyId. Чужие воронки игнорируются.',
        example: [1024, 1025],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    @Min(1, { each: true })
    dealIds?: number[];

    @ApiProperty({
        description: 'Новый ответственный менеджер.',
        example: 321,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    newResponsibleId: number;

    @ApiPropertyOptional({
        description:
            'Передавать ли просроченные задачи (по умолчанию да — новый ' +
            'менеджер должен видеть, на когда была договорённость).',
        example: true,
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    includeOverdue?: boolean;

    @ApiPropertyOptional({
        description:
            'Перепланировать просроченные дедлайны от даты передачи ' +
            '(по умолчанию нет — просрочка сохраняется).',
        example: false,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    rescheduleOverdue?: boolean;

    @ApiPropertyOptional({
        description:
            'Перевести основную сделку в стадию «Холодная» при передаче ' +
            '(по умолчанию стадия не меняется).',
        example: false,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    moveMainDealToCold?: boolean;

    @ApiPropertyOptional({
        description: 'Создать новому ответственному задачу «Звонок».',
        example: true,
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    createCallTask?: boolean;
}

/** Действие передачи — с чьей стороны инициатива. */
export type TransferWorkAction = 'give' | 'take';

/** Элемент пачки — внутренний контракт. */
export interface ITransferWorkItem {
    action: TransferWorkAction;
    companyId?: number;
    dealIds?: number[];
    newResponsibleId: number;
    includeOverdue: boolean;
    rescheduleOverdue: boolean;
    moveMainDealToCold: boolean;
    createCallTask: boolean;
}

export function buildTransferWorkItem(
    action: TransferWorkAction,
    dto: TransferWorkRunDto,
): ITransferWorkItem {
    return {
        action,
        companyId: dto.companyId,
        dealIds: dto.dealIds,
        newResponsibleId: dto.newResponsibleId,
        includeOverdue: dto.includeOverdue ?? true,
        rescheduleOverdue: dto.rescheduleOverdue ?? false,
        moveMainDealToCold: dto.moveMainDealToCold ?? false,
        createCallTask: dto.createCallTask ?? true,
    };
}
