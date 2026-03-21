import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsBoolean,
    IsOptional,
    IsNotEmpty,
} from 'class-validator';

export class CreateInfoblockDto {
    @ApiProperty({
        description: 'Infoblock number',
        example: 1,
        type: Number,
    })
    @IsNumber()
    number: number;

    @ApiProperty({
        description: 'Infoblock name',
        example: 'Infoblock Name',
        type: String,
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Infoblock title',
        example: 'Infoblock Title',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    title?: string | null;

    @ApiProperty({
        description: 'Infoblock description',
        example: 'Description',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    description?: string | null;

    @ApiProperty({
        description: 'Infoblock description for sale',
        example: 'Description for sale',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    descriptionForSale?: string | null;

    @ApiProperty({
        description: 'Infoblock short description',
        example: 'Short description',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    shortDescription?: string | null;

    @ApiProperty({
        description: 'Infoblock weight',
        example: '1.5',
        type: String,
    })
    @IsString()
    weight: string;

    @ApiProperty({
        description: 'Infoblock code',
        example: 'code',
        type: String,
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'In group ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    inGroupId?: string | null;

    @ApiProperty({
        description: 'Group ID',
        example: '1',
        type: String,
        required: true,
    })
    @IsString()
    @IsNotEmpty({ message: 'group_id is required' })
    group_id: string;

    @ApiProperty({
        description: 'Is LA',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isLa: boolean;

    @ApiProperty({
        description: 'Is free',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isFree: boolean;

    @ApiProperty({
        description: 'Is showing',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isShowing: boolean;

    @ApiProperty({
        description: 'Is set',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isSet: boolean;

    @ApiProperty({
        description: 'Is product',
        example: false,
        type: Boolean,
        required: false,
        nullable: true,
    })
    @IsBoolean()
    @IsOptional()
    isProduct?: boolean | null;

    @ApiProperty({
        description: 'Is package',
        example: false,
        type: Boolean,
        required: false,
        nullable: true,
    })
    @IsBoolean()
    @IsOptional()
    isPackage?: boolean | null;

    @ApiProperty({
        description: 'Tag',
        example: 'tag',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    tag?: string | null;

    @ApiProperty({
        description: 'Parent ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    parent_id?: string | null;

    @ApiProperty({
        description: 'Relation ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    relation_id?: string | null;

    @ApiProperty({
        description: 'Related ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    related_id?: string | null;

    @ApiProperty({
        description: 'Excluded ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    @IsString()
    @IsOptional()
    excluded_id?: string | null;
}
