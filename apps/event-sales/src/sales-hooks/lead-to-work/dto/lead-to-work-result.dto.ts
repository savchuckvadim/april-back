import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Итог преобразования одного лида. */
export class LeadToWorkItemResultDto {
    @ApiProperty({
        description: 'Идентификатор обработанного лида.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    @ApiProperty({
        description:
            'Лид уже был преобразован ранее (найдена наша сделка) — ' +
            'вторая сделка не создавалась, связи доведены.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    reused: boolean;

    @ApiPropertyOptional({
        description: 'Идентификатор основной сделки ОП (создана или reuse).',
        example: 1024,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    baseDealId: number | null;

    @ApiPropertyOptional({
        description: 'Идентификатор ХО-сделки (только при isXo=Y).',
        example: 1025,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    xoDealId: number | null;

    @ApiPropertyOptional({
        description:
            'Идентификатор компании (существующей или созданной по флагу).',
        example: 7,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    companyId: number | null;

    @ApiProperty({
        description: 'Сколько открытых задач перенесено (move-режим).',
        example: 2,
        type: Number,
    })
    @IsInt()
    tasksMoved: number;

    @ApiProperty({
        description: 'Сколько открытых задач закрыто (close/ХО-режим).',
        example: 0,
        type: Number,
    })
    @IsInt()
    tasksClosed: number;

    @ApiProperty({
        description: 'Создана ли новая задача «Звонок»/«Холодный обзвон».',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    taskCreated: boolean;

    @ApiProperty({
        description:
            'Предупреждения graceful degradation: несопоставленные стадии, ' +
            'неустановленные поля — шаг пропущен, операция не падала.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Результат операции «лид → работа». */
export class LeadToWorkResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Итоги по каждому лиду пачки.',
        type: [LeadToWorkItemResultDto],
    })
    @IsArray()
    items: LeadToWorkItemResultDto[];

    @ApiProperty({
        description: 'Идентификаторы лидов из пачки (эхо входных данных).',
        example: [42],
        type: [Number],
    })
    @IsArray()
    leadIds: number[];

    @ApiProperty({
        description: 'Краткое пояснение итога операции.',
        example: 'Преобразовано лидов: 1 (создано сделок: 1, reuse: 0).',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция «лид → работа» с типизированным результатом. */
export class LeadToWorkOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: LeadToWorkResultDto,
        nullable: true,
    })
    declare result: LeadToWorkResultDto | null;
}
