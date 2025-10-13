import { ApiProperty } from '@nestjs/swagger';
import {

    IsOptional,
    IsBoolean,
    IsNumber,
    IsEnum,

} from 'class-validator';

import { PageType } from './create-offer-template-page.dto';


export class OfferTemplatePageQueryDto {
    @ApiProperty({ description: 'The offer template id' })
    @IsNumber()
    offer_template_id: number;

    @ApiProperty({ description: 'The order of the offer template page' })
    @IsNumber()
    order: number;

    @ApiProperty({
        description: 'The type of the offer template page',
        enum: PageType,
        enumName: 'PageType'
    })
    @IsEnum(PageType)
    @IsOptional()
    type?: PageType = PageType.DEFAULT;

    @ApiProperty({ description: 'The is active of the offer template page' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;





}
