import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MinimalUserDto } from './user.dto';
import { ContactDto } from './contact.dto';
import { EnumEventPlanCode } from '../../types/plan-types';

/** Текущий тип планируемого звонка (ветка plan-flow). */
export class EventPlanCallDto {
    @ApiProperty({
        description: 'Идентификатор типа звонка в портале.',
        type: Number,
        example: 3,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description:
            'Код этапа планируемого звонка, определяющий ветку планирования.',
        enum: EnumEventPlanCode,
        example: EnumEventPlanCode.WARM,
    })
    @IsEnum(EnumEventPlanCode)
    code: EnumEventPlanCode;

    @ApiProperty({
        description: 'Отображаемое название этапа звонка.',
        type: String,
        example: 'Тёплый звонок',
    })
    @IsString()
    name: string;
}

export class PlanTypeDto {
    @ApiPropertyOptional({
        description:
            'Текущий выбранный тип планируемого звонка. `null`, когда менеджер ' +
            'ничего не планировал: недозвон, возврат в ТМЦ, отчёт без плана. ' +
            'Ветку `plan` фронт присылает всегда (legacy-контракт), поэтому ' +
            'пустой тип — штатная ситуация, а не ошибка.',
        type: EventPlanCallDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventPlanCallDto)
    current: EventPlanCallDto | null;
}

export class PlanDto {
    @ApiProperty({
        description: 'Ответственный за планируемый звонок (минимальная форма).',
        type: MinimalUserDto,
    })
    @ValidateNested()
    @Type(() => MinimalUserDto)
    responsibility: MinimalUserDto;

    @ApiProperty({
        description: 'Автор плана (минимальная форма пользователя).',
        type: MinimalUserDto,
    })
    @ValidateNested()
    @Type(() => MinimalUserDto)
    createdBy: MinimalUserDto;

    @ApiProperty({
        description: 'Тип планируемого звонка с текущим выбранным этапом.',
        type: PlanTypeDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => PlanTypeDto)
    type: PlanTypeDto;

    @ApiProperty({
        description: 'Название/заголовок планируемого звонка.',
        type: String,
        example: 'Перезвонить по КП',
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Срок (дедлайн) планируемого звонка (ISO 8601).',
        type: String,
        example: '2026-06-10T15:00:00+03:00',
    })
    @IsString()
    deadline: string;

    @ApiProperty({
        description: 'Признак того, что звонок запланирован.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isPlanned: boolean;

    @ApiPropertyOptional({
        description:
            'Контакт, на который планируется звонок. `null`, если не задан.',
        type: ContactDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContactDto)
    contact: ContactDto | null;

    @ApiProperty({
        description: 'Признак активности плана (учитывать ли его в flow).',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiPropertyOptional({
        description:
            'Флаг «важная» из UI планирования: задача ставится с PRIORITY=HIGH ' +
            'независимо от типа события. Без флага важность определяет тип ' +
            '(presentation/hot/moneyAwait). Поле опциональное: старые сборки ' +
            'фрейма его не шлют.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    isImportant?: boolean;

    @ApiPropertyOptional({
        description:
            'Лиды/заявки, с которыми менеджер связал новую задачу ' +
            '(чекбоксы при создании задачи из сделки/компании без текущей ' +
            'задачи) — попадут в UF_CRM_TASK как L_{id}.',
        type: [Number],
        example: [42, 77],
    })
    @IsOptional()
    @IsNumber({}, { each: true })
    relatedLeadIds?: number[];
}
