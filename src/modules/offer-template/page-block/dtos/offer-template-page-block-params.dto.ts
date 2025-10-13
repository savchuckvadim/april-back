import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplatePageBlockIdParamsDto {
    @ApiProperty({ description: 'The offer template page block id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}
