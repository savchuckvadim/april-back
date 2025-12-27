import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateBtxRpaDto {
    @ApiProperty({
        description: 'RPA name',
        example: 'RPA Name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'RPA title',
        example: 'RPA Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'RPA code',
        example: 'RPA_CODE',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'RPA type',
        example: 'type',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Type ID',
        example: 'typeId',
    })
    @IsString()
    @IsNotEmpty()
    typeId: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Image',
        example: 'image.png',
    })
    @IsString()
    @IsOptional()
    image?: string;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    @IsNumber()
    @IsOptional()
    bitrixId?: number;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: 134,
    })
    @IsNumber()
    @IsOptional()
    entityTypeId?: number;

    @ApiPropertyOptional({
        description: 'For Stage ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    forStageId?: number;

    @ApiPropertyOptional({
        description: 'For Filter ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    forFilterId?: number;

    @ApiPropertyOptional({
        description: 'CRM ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    crmId?: number;
}

