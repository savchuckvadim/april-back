import { Decimal } from "generated/prisma/runtime/library";
import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";


export class CreatePortalRegionDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'april-dev.bitrix24.ru',
        required: true
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Code of the region',
        example: 'kbr',
        required: true
    })
    @IsString()
    regionCode: string;
}

export class UpdatePortalRegionDto {
    @ApiProperty({
        description: 'Domain of the Bitrix24 portal',
        example: 'april-dev.bitrix24.ru',
        required: true
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Code of the region',
        example: 'kbr',
        required: true
    })
    @IsString()
    regionCode: string;

    @ApiProperty({
        description: 'Own AB',
        example: 1000.00,
        required: true
    })
    @IsNumber()
    own_abs: Decimal | null;

    @ApiProperty({
        description: 'Own tax',
        example: 1000.00,
        required: true
    })
    @IsNumber()
    own_tax: Decimal | null;

    @ApiProperty({
        description: 'Own tax abs',
        example: 1000.00,
        required: true
    })
    @IsNumber()
    own_tax_abs: Decimal | null;
}


export class DeletePortalRegionDto {
    @ApiProperty({
        description: 'ID of the portal',
        example: 1,
        required: true
    })
    @IsNumber()
    portalId: number;

    @ApiProperty({
        description: 'ID of the region',
        example: 1,
        required: true
    })
    @IsNumber() 
    regionId: number;
}