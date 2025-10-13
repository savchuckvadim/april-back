import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateOfferTemplatePageStickerDto {
    @ApiProperty({ description: 'The offer template page id' })
    @IsNumber()
    offer_template_page_id: number;

    @ApiProperty({ description: 'The order of the offer template page sticker' })
    @IsNumber()
    order: number;

    @ApiProperty({ description: 'The name of the offer template page sticker' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'The code of the offer template page sticker' })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiProperty({ description: 'The size of the offer template page sticker' })
    @IsString()
    size: string;

    @ApiProperty({ description: 'The height of the offer template page sticker' })
    @IsString()
    height: string;

    @ApiProperty({ description: 'The width of the offer template page sticker' })
    @IsString()
    width: string;

    @ApiProperty({ description: 'The position of the offer template page sticker' })
    @IsString()
    @IsOptional()
    position?: string;

    @ApiProperty({ description: 'The style of the offer template page sticker' })
    @IsString()
    @IsOptional()
    style?: string;

    @ApiProperty({ description: 'The settings of the offer template page sticker' })
    @IsString()
    @IsOptional()
    settings?: string;

    @ApiProperty({ description: 'The background of the offer template page sticker' })
    @IsString()
    @IsOptional()
    background?: string;

    @ApiProperty({ description: 'The colors of the offer template page sticker' })
    @IsString()
    @IsOptional()
    colors?: string;

    @ApiProperty({ description: 'The image id of the offer template page sticker' })
    @IsNumber()
    @IsOptional()
    image_id?: number;
}
