import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsEnum, IsNumber } from "class-validator";
import { BitrixOwnerTypeId } from "./category-response.dto";


export class GetCategoryListDto {

    @ApiProperty({
        description: 'The domain of the category',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    domain: string

    @ApiProperty({
        description: 'The type of entity',
        enum: BitrixOwnerTypeId,
        enumName: 'BitrixOwnerTypeId',
        example: BitrixOwnerTypeId.DEAL,
        examples: [

            { value: BitrixOwnerTypeId.DEAL, description: 'Deal' },

            { value: BitrixOwnerTypeId.LEAD, description: 'Lead' }
        ]
    })
    @IsEnum(BitrixOwnerTypeId)
    entityTypeId: BitrixOwnerTypeId
}


export class GetCategoryWithStagesDto {

    @ApiProperty({
        description: 'The domain of the category',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    domain: string

    @ApiProperty({
        description: 'The id of the category',
        example: 1
    })
    @IsNumber()
    categoryId: number
    @ApiProperty({
        description: 'The type of entity',
        enum: BitrixOwnerTypeId,
        enumName: 'BitrixOwnerTypeId',
        example: BitrixOwnerTypeId.DEAL,
        examples: [

            { value: BitrixOwnerTypeId.DEAL, description: 'Deal' },

            { value: BitrixOwnerTypeId.LEAD, description: 'Lead' }
        ]
    })
    @IsEnum(BitrixOwnerTypeId)
    entityTypeId: BitrixOwnerTypeId
}


export class GetStagesDto {

    @ApiProperty({
        description: 'The domain of the category',
        example: 'example.bitrix24.ru'
    })
    @IsString()
    domain: string

    @ApiProperty({
        description: 'The id of the category',
        example: 1
    })
    @IsNumber()
    categoryId: number
}

