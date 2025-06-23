import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsString } from "class-validator";

export class BitrixMethodDto {
    @ApiProperty({ description: 'Domain of the portal' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'Method of the bitrix' })
    @IsString()
    method: string;

    @ApiProperty({ description: 'Params of the bitrix' })
    @IsObject()
    bxData: any;
}