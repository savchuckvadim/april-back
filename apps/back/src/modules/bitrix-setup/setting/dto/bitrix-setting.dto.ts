import { IsString, IsOptional } from 'class-validator';

export class CreateBitrixSettingDto {
    @IsString()
    settingable_type: string;

    @IsString()
    code: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    value?: string;
}

export class UpdateBitrixSettingDto {
    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    value?: string;
}
