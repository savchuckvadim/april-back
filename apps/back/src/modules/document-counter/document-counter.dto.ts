import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CounterType } from './lib/counter-type.enum';

export class CreateCounterDto {
    @ApiProperty()
    @IsNotEmpty()
    @IsInt()
    @Transform(({ value }) => Number(value))
    rq_id: number;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Transform(({ value }) => (value != null ? Number(value) : 0))
    value?: number;

    @ApiPropertyOptional({ enum: CounterType })
    @IsOptional()
    @IsEnum(CounterType)
    type?: CounterType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    prefix?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    postfix?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'false' || value === '0' || value === 'null')
            return false;
        return Boolean(value);
    })
    day?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'false' || value === '0' || value === 'null')
            return false;
        return Boolean(value);
    })
    month?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'false' || value === '0' || value === 'null')
            return false;
        return Boolean(value);
    })
    year?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Transform(({ value }) => (value != null ? Number(value) : 0))
    count?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Transform(({ value }) => (value != null ? Number(value) : 1))
    size?: number;
}
