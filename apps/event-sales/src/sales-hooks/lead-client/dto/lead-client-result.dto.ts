import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    LEAD_CLIENT_KINDS,
    LeadClientKind,
} from '../../../shared/lead-client/lead-client.types';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Клиент, созданный из лида. */
export class LeadClientCreatedDto {
    @ApiProperty({
        description: 'Лид-источник.',
        example: 347931,
        type: Number,
    })
    @IsInt()
    leadId: number;

    @ApiProperty({
        description: 'Тип созданного клиента.',
        example: 'contact',
        type: String,
        enum: LEAD_CLIENT_KINDS,
    })
    @IsIn(LEAD_CLIENT_KINDS as unknown as string[])
    type: LeadClientKind;

    @ApiProperty({
        description: 'Идентификатор клиента.',
        example: 285757,
        type: Number,
    })
    @IsInt()
    id: number;

    @ApiProperty({
        description:
            'Клиент уже был создан из этого лида раньше (найден по LEAD_ID) — ' +
            'второй не создавался.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    reused: boolean;
}

/** Итог по одной сделке. */
export class LeadClientItemResultDto {
    @ApiProperty({ description: 'Сделка.', example: 81457, type: Number })
    @IsInt()
    dealId: number;

    @ApiProperty({
        description: 'Клиенты, созданные из голых лидов.',
        type: [LeadClientCreatedDto],
    })
    @IsArray()
    created: LeadClientCreatedDto[];

    @ApiProperty({
        description: 'Контакты, добавленные к сделке этим прогоном.',
        example: [285757],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    dealContactsAdded: number[];

    @ApiPropertyOptional({
        description: 'Компания, поставленная сделке без компании.',
        example: 167991,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    dealCompanySet: number | null;

    @ApiProperty({
        description:
            'Сколько новых привязок дел лида (звонки, письма) добавлено.',
        example: 3,
        type: Number,
    })
    @IsInt()
    activitiesBound: number;

    @ApiProperty({
        description: 'ИНН, найденные при переносе данных заявки.',
        example: ['7707083893'],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    inns: string[];

    @ApiProperty({
        description:
            'Предупреждения: лид не прочитан, у сделки другая компания и т.п.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Результат операции «клиент из лида». */
export class LeadClientResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Итоги по сделкам пачки.',
        type: [LeadClientItemResultDto],
    })
    @IsArray()
    items: LeadClientItemResultDto[];

    @ApiProperty({
        description: 'Краткое пояснение итога.',
        example: 'Сделок: 1, создано клиентов: 1, привязано к сделкам: 1.',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция «клиент из лида» с типизированным результатом. */
export class LeadClientOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: LeadClientResultDto,
        nullable: true,
    })
    declare result: LeadClientResultDto | null;
}
