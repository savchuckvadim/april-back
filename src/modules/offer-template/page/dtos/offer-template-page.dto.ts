    import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNumber, IsString, ValidateNested } from "class-validator";
import { OfferTemplatePage } from "../entities/offer-template-page.entity";
import { Type } from "class-transformer";
import { OfferTemplatePageBlockDto } from "../../page-block/";

export class OfferTemplatePageDto extends OfferTemplatePage {

    @ApiProperty({ description: 'The id of the offer template page' })
    @IsString()
    declare id: string;

    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    declare offer_template_id: bigint;

    @ApiProperty({ description: 'The order of the offer template page' })
    @IsNumber()
    declare order: number;

    @ApiProperty({ description: 'The name of the offer template page' })
    @IsString()
    declare name: string;

    @ApiProperty({ description: 'The code of the offer template page' })
    @IsString()
    declare code: string;

    @ApiProperty({ description: 'The type of the offer template page' })
    @IsString()
    declare type: "description" | "default" | "letter" | "infoblocks" | "price" | "lt" | "other";

    @ApiProperty({ description: 'The is active of the offer template page' })
    @IsBoolean()
    declare is_active: boolean;

    @ApiProperty({ description: 'The settings of the offer template page' })
    @IsString()
    declare settings: string;

    @ApiProperty({ description: 'The stickers of the offer template page' })
    @IsString()
    declare stickers: string;

    @ApiProperty({ description: 'The background of the offer template page' })
    @IsString()
    declare background: string;

    @ApiProperty({ description: 'The colors of the offer template page' })
    @IsString()
    declare colors: string;

    @ApiProperty({ description: 'The fonts of the offer template page' })
    @IsString()
    declare fonts: string;

    @ApiProperty({ description: 'The blocks of the offer template page' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferTemplatePageBlockDto)
    declare blocks: OfferTemplatePageBlockDto[];
}
