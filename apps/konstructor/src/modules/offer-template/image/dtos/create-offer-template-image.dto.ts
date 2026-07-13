import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    IsNumber,
} from 'class-validator';

export enum StorageType {
    APP = 'app',
    PUBLIC = 'public',
    PRIVATE = 'private',
}

export enum ImageParent {
    TEMPLATE = 'template',
    PAGE = 'page',
    BLOCK = 'block',
    STICKER = 'sticker',
    OTHER = 'other',
}

export class CreateOfferTemplateImageDto {
    @IsString()
    path: string;

    @IsEnum(StorageType)
    @IsOptional()
    storage_type?: StorageType = StorageType.PUBLIC;

    @IsString()
    @IsOptional()
    original_name?: string;

    @IsString()
    @IsOptional()
    mime?: string;

    @IsString()
    size: string;

    @IsString()
    height: string;

    @IsString()
    width: string;

    @IsString()
    @IsOptional()
    position?: string;

    @IsString()
    @IsOptional()
    style?: string;

    @IsString()
    @IsOptional()
    settings?: string;

    @IsBoolean()
    @IsOptional()
    is_public?: boolean = false;

    @IsEnum(ImageParent)
    @IsOptional()
    parent?: ImageParent = ImageParent.OTHER;

    @IsString()
    @IsOptional()
    bitrix_user_id?: string;

    @IsString()
    @IsOptional()
    domain?: string;

    @IsNumber()
    @IsOptional()
    portal_id?: number;
}
