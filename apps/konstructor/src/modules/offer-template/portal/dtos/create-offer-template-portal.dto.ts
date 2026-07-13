import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class CreateOfferTemplatePortalDto {
    @IsNumber()
    offer_template_id: number;

    @IsNumber()
    portal_id: number;

    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;
}
