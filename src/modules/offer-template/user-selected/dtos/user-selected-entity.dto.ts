import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDate, IsString } from 'class-validator';
import { UserSelectedTemplate } from '../entities/user-selected-template.entity';

export class UserSelectedTemplateEntityDto {
    @ApiProperty({ description: 'The id', example: '1', type: String })
    @IsString()
    id: string;
    bitrix_user_id: string;
    @ApiProperty({
        description: 'The bitrix user id',
        example: '1',
        type: String,
    })
    @IsString()
    portal_id: string;
    @ApiProperty({ description: 'The portal id', example: '1', type: String })
    @IsString()
    offer_template_id: string;

    @ApiProperty({
        description: 'The is current',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    is_current: boolean;
    @ApiProperty({
        description: 'The is favorite',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    is_favorite: boolean;
    @ApiProperty({ description: 'The is active', example: true, type: Boolean })
    @IsBoolean()
    is_active: boolean;
    @ApiProperty({
        description: 'The price settings',
        example: '1',
        type: String,
    })
    @IsString()
    price_settings?: string;
    @ApiProperty({
        description: 'The infoblock settings',
        example: '1',
        type: String,
    })
    @IsString()
    infoblock_settings?: string;
    @ApiProperty({ description: 'The letter text', example: '1', type: String })
    @IsString()
    letter_text?: string;
    @ApiProperty({ description: 'The sale text 1', example: '1', type: String })
    @IsString()
    sale_text_1?: string;
    @ApiProperty({ description: 'The sale text 2', example: '1', type: String })
    @IsString()
    sale_text_2?: string;
    @ApiProperty({ description: 'The sale text 3', example: '1', type: String })
    @IsString()
    sale_text_3?: string;
    @ApiProperty({ description: 'The sale text 4', example: '1', type: String })
    @IsString()
    sale_text_4?: string;
    @ApiProperty({ description: 'The sale text 5', example: '1', type: String })
    @IsString()
    sale_text_5?: string;
    @ApiProperty({
        description: 'The created at',
        example: new Date(),
        type: Date,
    })
    @IsDate()
    created_at?: Date;
    @ApiProperty({
        description: 'The updated at',
        example: new Date(),
        type: Date,
    })
    @IsDate()
    updated_at?: Date;

    constructor(partial: Partial<UserSelectedTemplate>) {
        Object.assign(this, {
            ...partial,
            id: String(partial.id),
            bitrix_user_id: String(partial.bitrix_user_id),
            portal_id: String(partial.portal_id),
            offer_template_id: String(partial.offer_template_id),
            is_current: partial.is_current ?? false,
            is_favorite: partial.is_favorite ?? false,
            is_active: partial.is_active ?? false,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            price_settings: partial.price_settings ?? undefined,
            infoblock_settings: partial.infoblock_settings ?? undefined,
            letter_text: partial.letter_text ?? undefined,
            sale_text_1: partial.sale_text_1 ?? undefined,
            sale_text_2: partial.sale_text_2 ?? undefined,
            sale_text_3: partial.sale_text_3 ?? undefined,
            sale_text_4: partial.sale_text_4 ?? undefined,
            sale_text_5: partial.sale_text_5 ?? undefined,
        });
    }
}
