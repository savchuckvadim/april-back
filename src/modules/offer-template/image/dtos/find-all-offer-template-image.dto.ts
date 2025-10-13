import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageType, ImageParent } from './create-offer-template-image.dto';

export class OfferTemplateImageQueryDto {
    @ApiPropertyOptional({ example: 1 })
    @IsNumber()
    @IsOptional()
    portal_id?: string;

    @ApiPropertyOptional({
        enum: StorageType,
        description: 'Тип хранения',
        enumName: 'StorageType'
    })
    @IsEnum(StorageType)
    @IsOptional()
    storage_type?: StorageType;

    @ApiPropertyOptional({
        enum: ImageParent,
        description: 'Родитель',
        enumName: 'ImageParent'
    })
    @IsEnum(ImageParent)
    @IsOptional()
    parent?: ImageParent;

    @ApiPropertyOptional({ description: 'Публичный ли объект', type: Boolean })
    @IsBoolean()
    @IsOptional()
    is_public?: boolean;
}
