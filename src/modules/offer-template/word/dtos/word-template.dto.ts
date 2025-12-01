import { ApiProperty } from '@nestjs/swagger';
import { WordTemplate, WordTemplateSummary } from '../entities/word-template.entity';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';
import { IsString } from 'class-validator';
import { UserSelectedTemplate } from '../../user-selected';

export class WordTemplateDto extends WordTemplate {
    @ApiProperty()
    @IsString()
    declare id: string;

    @ApiProperty()
    declare name: string;

    @ApiProperty({ enum: OfferTemplateVisibility })
    declare visibility: OfferTemplateVisibility;

    @ApiProperty()
    declare is_default: boolean;

    @ApiProperty()
    declare file_path: string;

    @ApiProperty({ required: false })
    declare demo_path?: string;

    @ApiProperty()
    declare type: string;

    @ApiProperty()
    declare code: string;

    @ApiProperty({ required: false })
    declare tags?: string;

    @ApiProperty()
    declare is_active: boolean;

    @ApiProperty()
    declare counter: number;

    @ApiProperty({ required: false })
    declare template_url?: string;

    @ApiProperty({ required: false })
    declare created_at?: Date;

    @ApiProperty({ required: false })
    declare updated_at?: Date;
}

export class WordTemplateSummaryDto extends WordTemplateSummary {
    @ApiProperty()
    declare id: string;

    @ApiProperty()
    declare name: string;

    @ApiProperty({ enum: OfferTemplateVisibility })
    declare visibility: OfferTemplateVisibility;

    @ApiProperty()
    declare is_default: boolean;

    @ApiProperty()
    declare type: string;

    @ApiProperty()
    declare code: string;

    @ApiProperty()
    declare is_active: boolean;

    @ApiProperty()
    declare counter: number;

    @ApiProperty({ required: false })
    declare template_url?: string;

    @ApiProperty({ required: false })
    declare created_at?: Date;
}

export class UserSelectedTemplateSummaryDto {
    constructor(partial: Partial<UserSelectedTemplate>) {

        Object.assign(this, {
            // id: String(partial.id),
            template_id: Number(partial.offer_template_id),
            is_current: partial.is_current,
            is_favorite: partial.is_favorite,
            is_active: partial.is_active,
            portal_id: Number(partial.portal_id),
            bitrix_user_id: Number(partial.bitrix_user_id),
        });
    }
    @ApiProperty()
    id: number;

    @ApiProperty()
    bitrix_user_id: number;

    @ApiProperty()
    portal_id: number;

    @ApiProperty()
    template_id: number;

    @ApiProperty()
    is_current: boolean;

    @ApiProperty()
    is_favorite: boolean;

    @ApiProperty()
    is_active: boolean;


}
