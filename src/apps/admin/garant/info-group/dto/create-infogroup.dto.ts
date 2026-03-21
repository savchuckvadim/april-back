import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import {
    InfogroupType,
    InfogroupProductType,
} from '@/modules/garant/infogroup/';

export class CreateInfogroupDto {
    @ApiProperty({
        description: 'Infogroup number',
        example: 1,
        type: Number,
    })
    @IsNumber()
    number: number;

    @ApiProperty({
        description: 'Infogroup code',
        example: 'code',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Infogroup name',
        example: 'Group Name',
        type: String,
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Infogroup title',
        example: 'Group Title',
        type: String,
    })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Infogroup description',
        example: 'Description',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    description?: string | null;

    @ApiProperty({
        description: 'Infogroup description for sale',
        example: 'Description for sale',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    descriptionForSale?: string | null;

    @ApiProperty({
        description: 'Infogroup short description',
        example: 'Short description',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    shortDescription?: string | null;

    @ApiProperty({
        description: 'Infogroup type',
        example: InfogroupType.INFOBLOCKS,
        enum: InfogroupType,
    })
    @IsEnum(InfogroupType)
    type: InfogroupType;

    @ApiProperty({
        description: 'Infogroup product type',
        example: InfogroupProductType.GARANT,
        enum: InfogroupProductType,
    })
    @IsEnum(InfogroupProductType)
    productType: InfogroupProductType;
}
