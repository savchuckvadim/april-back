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
    @ApiProperty({
        description: 'Текущий выбранный тип планируемого звонка.',
        type: EventPlanCallDto,
    })
    @ValidateNested()
    @Type(() => EventPlanCallDto)
    current: EventPlanCallDto;
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
}
