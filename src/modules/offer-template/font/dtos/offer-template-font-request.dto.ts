import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsOptional } from "class-validator";

export class OfferTemplateFontQueryDto {
    @ApiProperty({ example: 1 })
    @IsNumber()
    @IsOptional()
    offer_template_id?: number;
}
