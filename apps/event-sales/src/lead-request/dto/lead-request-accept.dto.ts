import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Принятие заявки менеджером («взял в работу»). Назначение ≠ принятие:
 * ХО-хук ставит «Назначена менеджеру», принятие фиксируется здесь —
 * от разницы считается время первичной обработки (op_lead_firstprepare_long).
 */
export class LeadRequestAcceptDto {
    @ApiProperty({
        description: 'Домен портала Bitrix.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор лида (заявки). Можно не передавать, если передан ' +
            'dealId — лид найдётся по связи сделки (deal_from_lead_id/LEAD_ID).',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description:
            'Идентификатор ОСНОВНОЙ сделки менеджера. Менеджер работает ' +
            'только в своей воронке — робот на смену стадии сделки шлёт ' +
            'dealId, лид резолвится по связям. Нужен leadId ИЛИ dealId.',
        example: 1024,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    dealId?: number;

    @ApiPropertyOptional({
        description:
            'Кто принял (id пользователя Bitrix). Не передан — считается, ' +
            'что принял текущий ответственный лида.',
        example: 447,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;
}

/** Итог принятия заявки. */
export class LeadRequestAcceptResultDto {
    @ApiProperty({
        description: 'Принятие зафиксировано (или уже было зафиксировано).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    success: boolean;

    @ApiProperty({
        description:
            'Заявка уже была принята после последнего назначения — ' +
            'повторный вызов ничего не менял (идемпотентность).',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    already: boolean;

    @ApiPropertyOptional({
        description:
            'Время первичной обработки в секундах (от назначения ХО до ' +
            'принятия), если удалось вычислить и поле было пустым.',
        example: 1800,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    firstprepareSeconds: number | null;

    @ApiProperty({
        description: 'Предупреждения graceful degradation.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}
