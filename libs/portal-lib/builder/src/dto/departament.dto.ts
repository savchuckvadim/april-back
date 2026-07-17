import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';
import {
    EDepartamentGroup,
    IDepartment,
} from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Отдел (департамент) портала, как его отдавал Laravel (raw Departament). */
export class DepartamentDto implements IDepartment {
    @ApiProperty({
        description: 'ID отдела в нашей БД',
        example: 2,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({ description: 'Тип отдела', example: 'sales', type: String })
    @IsString()
    type!: string;

    @ApiProperty({
        description: 'Группа отдела',
        enum: EDepartamentGroup,
        example: EDepartamentGroup.sales,
    })
    @IsEnum(EDepartamentGroup)
    group!: EDepartamentGroup;

    @ApiProperty({
        description: 'Системное имя отдела',
        example: 'sales_department',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название отдела',
        example: 'Отдел продаж',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'ID отдела в Битрикс',
        example: 15,
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
