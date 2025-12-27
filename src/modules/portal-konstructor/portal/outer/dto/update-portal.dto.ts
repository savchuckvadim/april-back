import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class UpdatePortalOuterDto  {
    @ApiProperty()
    @IsString()
    domain: string;

    @ApiProperty()
    @IsNumber()
    number: number;

    @ApiProperty()
    @IsString()
    key: string;

    @ApiProperty()
    @IsString()
    clientId: string;

    @ApiProperty()
    @IsString()
    clientSecret: string;

    @ApiProperty()
    @IsString()
    hook: string;
}
