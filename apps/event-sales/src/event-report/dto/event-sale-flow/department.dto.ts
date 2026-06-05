import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type DepartamentCode = 'sales' | 'tmc';

/** Runtime-список кодов подразделения для валидации и Swagger. */
export const DEPARTAMENT_CODE_VALUES = [
    'sales',
    'tmc',
] as const satisfies readonly DepartamentCode[];

export class DepartamentModeDto {
    @ApiProperty({
        description: 'Идентификатор подразделения в портале Bitrix.',
        type: Number,
        example: 5,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description:
            'Код подразделения, определяющий ветку flow: `sales` (продажи) ' +
            'или `tmc` (товарно-материальные ценности).',
        type: String,
        enum: DEPARTAMENT_CODE_VALUES,
        example: 'sales',
    })
    @IsString()
    @IsIn(DEPARTAMENT_CODE_VALUES as unknown as string[])
    code: DepartamentCode;

    @ApiProperty({
        description: 'Отображаемое название подразделения.',
        type: String,
        example: 'Отдел продаж',
    })
    @IsString()
    name: string;
}

export class DepartamentDto {
    @ApiPropertyOptional({
        description: 'Текущий режим/подразделение, в котором выполняется flow.',
        type: DepartamentModeDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DepartamentModeDto)
    mode?: DepartamentModeDto;
}
