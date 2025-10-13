import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";
import { OfferTemplatePageBlock } from "..";

export class OfferTemplatePageBlockDto extends OfferTemplatePageBlock {
    @ApiProperty({ description: 'The offer template page id' })
    @IsNumber()
    declare offer_template_page_id: bigint;

    @ApiProperty({ description: 'The order of the offer template page block' })
    @IsNumber()
    declare order: number;

    @ApiProperty({ description: 'The name of the offer template page block' })
    @IsString()
    declare name: string;

    @ApiProperty({ description: 'The code of the offer template page block' })
    @IsString()
    declare code: string;

    @ApiProperty({ description: 'The type of the offer template page block' })
    @IsString()
    declare type: "default" | "background" | "about" | "hero" | "letter" | "documentNumber" | "manager" | "logo" | "stamp" | "header" | "footer" | "infoblocks" | "price" | "slogan" | "infoblocksDescription" | "lt" | "otherComplects" | "comparison" | "comparisonComplects" | "comparisonIblocks" | "user";

    @ApiProperty({ description: 'The content of the offer template page block. JSON string. Long text.' })
    @IsString()
    declare content: string;

    @ApiProperty({ description: 'The settings of the offer template page block  JSON string. Long text.' })
    @IsString()
    declare settings: string;

    @ApiProperty({ description: 'The stickers of the offer template page block' })
    @IsString()
    declare stickers: string;

    @ApiProperty({ description: 'The background of the offer template page block' })
    @IsString()
    declare background: string;

    @ApiProperty({ description: 'The colors of the offer template page block' })
    @IsString()
    declare colors: string;

    @ApiProperty({ description: 'The image id of the offer template page block' })
    @IsNumber()
    declare image_id: bigint;
}
