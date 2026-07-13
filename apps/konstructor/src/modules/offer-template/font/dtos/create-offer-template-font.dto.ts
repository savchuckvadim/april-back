import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateOfferTemplateFontDto {
    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    offer_template_id: number;

    @ApiProperty({ description: 'The name of the offer template font' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'The code of the offer template font' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'The data of the offer template font' })
    @IsString()
    @IsOptional()
    data?: string;

    @ApiProperty({ description: 'The items of the offer template font' })
    @IsString()
    @IsOptional()
    items?: string;

    @ApiProperty({ description: 'The current of the offer template font' })
    @IsString()
    @IsOptional()
    current?: string;

    @ApiProperty({ description: 'The settings of the offer template font' })
    @IsString()
    @IsOptional()
    settings?: string;
}
