import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class OfferTemplateFontIdParamsDto {
    @ApiProperty({ description: 'The offer template font id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}

export class OfferTemplateFontTemplateIdParamsDto {
    @ApiProperty({ description: 'The offer template id', example: 1 })
    @IsNumber()
    @IsPositive()
    template_id: number;
}
