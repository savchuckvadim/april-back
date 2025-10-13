import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString } from "class-validator";
import { OfferTemplateFont } from "../entities/offer-template-font.entity";

export class OfferTemplateFontDto extends OfferTemplateFont {
    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    declare offer_template_id: bigint;

    @ApiProperty({ description: 'The name of the offer template font' })
    @IsString()
    declare name: string;

    @ApiProperty({ description: 'The code of the offer template font' })
    @IsString()
    declare code: string;

    @ApiProperty({ description: 'The data of the offer template font. JSON string. Long text.' })
    @IsString()
    declare data: string;

    @ApiProperty({ description: 'The items of the offer template font' })
    @IsString()
    declare items: string;

    @ApiProperty({ description: 'The current of the offer template font' })
    @IsString()
    declare current: string;

    @ApiProperty({ description: 'The settings of the offer template font. JSON string. Long text.' })
    @IsString()
    declare settings: string;
}
