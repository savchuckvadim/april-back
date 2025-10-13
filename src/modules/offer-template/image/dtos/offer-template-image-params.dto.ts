import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsEnum } from 'class-validator';
import { StorageType, ImageParent } from './create-offer-template-image.dto';

export class OfferTemplateImageIdParamsDto {
    @ApiProperty({ description: 'The offer template image id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}

export class OfferTemplateImagePortalIdParamsDto {
    @ApiProperty({ description: 'The portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    portal_id: number;
}

export class OfferTemplateImageParentParamsDto {
    @ApiProperty({
        description: 'The parent type',
        enum: ImageParent,
        example: 'template'
    })
    @IsEnum(ImageParent)
    parent: ImageParent;
}

export class OfferTemplateImageStorageTypeParamsDto {
    @ApiProperty({
        description: 'The storage type',
        enum: StorageType,
        example: 'app'
    })
    @IsEnum(StorageType)
    storage_type: StorageType;
}
