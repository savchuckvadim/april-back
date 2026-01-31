import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class BxRecordsByCompanyRequestDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: 'ID of the lead in Bitrix24',
        example: 12345,
    })
    @IsNumber()
    @IsNotEmpty()
    companyId: number;


    @ApiProperty({
        description: 'ids of relations contacts',
        example: [1, 2, 3]
    })
    @IsOptional()
    @IsArray()
    contactIds: number[]
}
