import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplatePortalIdParamsDto {
    @ApiProperty({ description: 'The offer template portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}
