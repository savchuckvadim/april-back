import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplateIdParamsDto {
    @ApiProperty({ description: 'The offer template id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}

export class OfferTemplatePortalIdParamsDto {
    @ApiProperty({ description: 'The portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    portal_id: number;
}

export class OfferTemplateUserPortalParamsDto {
    @ApiProperty({ description: 'The user id', example: 1 })
    @IsNumber()
    @IsPositive()
    user_id: number;

    @ApiProperty({ description: 'The portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    portal_id: number;
}
