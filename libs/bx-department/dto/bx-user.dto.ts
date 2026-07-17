import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsString } from 'class-validator';

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

    @ApiProperty()
    PERSONAL_PHOTO?: any;
}
