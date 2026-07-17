import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsString } from 'class-validator';
import { IPCallingTasksGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Runtime-константы union-литералов IPCallingTasksGroup (для IsIn и swagger enum). */
export const CALLING_GROUP_TYPE_VALUES = [
    'calling',
] as const satisfies readonly IPCallingTasksGroup['type'][];
export const CALLING_GROUP_GROUP_VALUES = [
    'sales',
    'service',
    'tmc',
] as const satisfies readonly IPCallingTasksGroup['group'][];

/** Группа задач на прозвон, как её отдавал Laravel (raw Calling). */
export class CallingGroupDto implements IPCallingTasksGroup {
    @ApiProperty({
        description: 'ID группы в нашей БД',
        example: 3,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Тип группы',
        enum: CALLING_GROUP_TYPE_VALUES,
        example: 'calling',
    })
    @IsIn(CALLING_GROUP_TYPE_VALUES)
    type!: IPCallingTasksGroup['type'];

    @ApiProperty({
        description: 'Группа (подразделение)',
        enum: CALLING_GROUP_GROUP_VALUES,
        example: 'sales',
    })
    @IsIn(CALLING_GROUP_GROUP_VALUES)
    group!: IPCallingTasksGroup['group'];

    @ApiProperty({
        description: 'Системное имя группы',
        example: 'sales_calling',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название группы',
        example: 'Звонки Продажи',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID группы задач в Битрикс',
        example: 21,
        type: Number,
    })
    @IsNumber()
    bitrixId!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;
}
