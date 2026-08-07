import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsNumber,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';

export class BXUserDto {
    @ApiProperty()
    @IsNumberString()
    ID: string;

    @ApiProperty()
    @IsString()
    NAME: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    LAST_NAME?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    EMAIL?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    WORK_PHONE?: string;

    @ApiPropertyOptional({
        type: [Number],
        description:
            'ID отделов, в которых состоит сотрудник (UF_DEPARTMENT). ' +
            'user.get отдаёт всегда — раньше DTO просто врал в меньшую сторону.',
        example: [3, 7],
    })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    UF_DEPARTMENT?: number[];

    @ApiPropertyOptional({
        description: 'Должность сотрудника.',
        example: 'Менеджер ОП',
    })
    @IsOptional()
    @IsString()
    WORK_POSITION?: string;

    @ApiPropertyOptional({
        description: 'ID отдела, которым сотрудник руководит (если руководит).',
        example: '7',
    })
    @IsOptional()
    @IsString()
    UF_HEAD_DEPARTMENT?: string;

    @ApiProperty()
    PERSONAL_PHOTO?: any;
}
