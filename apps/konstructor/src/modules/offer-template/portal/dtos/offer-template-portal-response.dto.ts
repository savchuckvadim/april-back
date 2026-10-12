import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';
import { OfferTemplatePortal } from '../entities/offer-template-portal.entity';

/**
 * Привязка шаблона КП к порталу — в ответе API.
 *
 * Все bigint уходят СТРОКАМИ: BigInt не сериализуется в JSON, и глобальный
 * ResponseInterceptor упал бы на первом же GET. Этот же DTO даёт Orval
 * внятные типы для админки (поля с @ApiProperty).
 */
export class OfferTemplatePortalResponseDto {
    @ApiProperty({ description: 'ID привязки.', type: String, example: '15' })
    id: string;

    @ApiProperty({
        description: 'ID шаблона КП (offer_templates.id).',
        type: String,
        example: '42',
    })
    offer_template_id: string;

    @ApiProperty({ description: 'ID портала.', type: String, example: '7' })
    portal_id: string;

    @ApiProperty({
        description: 'Шаблон по умолчанию для этого портала.',
        example: false,
    })
    is_default: boolean;

    @ApiProperty({
        description:
            'Активна ли привязка. Неактивная привязка не показывает шаблон на портале.',
        example: true,
    })
    is_active: boolean;

    @ApiPropertyOptional({ description: 'Когда создана.', nullable: true })
    created_at?: Date | null;

    @ApiPropertyOptional({ description: 'Когда изменена.', nullable: true })
    updated_at?: Date | null;

    static fromEntity(
        row: OfferTemplatePortal,
    ): OfferTemplatePortalResponseDto {
        const dto = new OfferTemplatePortalResponseDto();
        dto.id = String(row.id);
        dto.offer_template_id = String(row.offer_template_id);
        dto.portal_id = String(row.portal_id);
        dto.is_default = row.is_default;
        dto.is_active = row.is_active;
        dto.created_at = row.created_at ?? null;
        dto.updated_at = row.updated_at ?? null;
        return dto;
    }
}

export class OfferTemplatePortalTemplateParamsDto {
    @ApiProperty({
        description: 'ID шаблона КП (BIGINT, передаётся строкой).',
        type: String,
        example: '42',
    })
    @IsNumberString()
    template_id: string;
}

export class OfferTemplatePortalPortalParamsDto {
    @ApiProperty({
        description: 'ID портала (BIGINT, передаётся строкой).',
        type: String,
        example: '7',
    })
    @IsNumberString()
    portal_id: string;
}
