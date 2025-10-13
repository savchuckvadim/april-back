import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplatePageIdParamsDto {
    @ApiProperty({ description: 'The offer template page id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}

export class OfferTemplatePageTemplateIdParamsDto {
    @ApiProperty({ description: 'The offer template id', example: 1 })
    @IsNumber()
    @IsPositive()
    template_id: number;
}
