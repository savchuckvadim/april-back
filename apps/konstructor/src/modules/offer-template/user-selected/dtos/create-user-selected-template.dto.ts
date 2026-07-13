import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateUserSelectedTemplateDto {
    @IsNumber()
    bitrix_user_id: number;

    @IsNumber()
    portal_id: number;

    @IsNumber()
    offer_template_id: number;

    @IsBoolean()
    @IsOptional()
    is_current?: boolean = false;

    @IsBoolean()
    @IsOptional()
    is_favorite?: boolean = false;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;

    @IsString()
    @IsOptional()
    price_settings?: string;

    @IsString()
    @IsOptional()
    infoblock_settings?: string;

    @IsString()
    @IsOptional()
    letter_text?: string;

    @IsString()
    @IsOptional()
    sale_text_1?: string;

    @IsString()
    @IsOptional()
    sale_text_2?: string;

    @IsString()
    @IsOptional()
    sale_text_3?: string;

    @IsString()
    @IsOptional()
    sale_text_4?: string;

    @IsString()
    @IsOptional()
    sale_text_5?: string;
}
