import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    InvoiceTemplateType as InvoiceTemplateTypeSchema,
    InvoiceTemplateTypeValue,
    InvoiceTemplateVisibility as InvoiceTemplateVisibilitySchema,
    InvoiceTemplateVisibilityValue,
} from './invoice-template.enums';

const _invoiceTemplateVisibilityForMeta = InvoiceTemplateVisibilitySchema;
const _invoiceTemplateTypeForMeta = InvoiceTemplateTypeSchema;

export type InvoiceTemplateLike = {
    id: string;
    name: string;
    visibility: InvoiceTemplateVisibilityValue;
    type: InvoiceTemplateTypeValue;
    code: string;
    description: string | null;
    counter: number;
    is_default: boolean;
    is_active: boolean;
    is_archived: boolean;
    archived_at: Date | null;
    portal_id: bigint | null;
    agent_id: bigint | null;
    creator_bitrix_user_id: bigint | null;
    created_at: Date | null;
    updated_at: Date | null;
};

export class InvoiceTemplateResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ enum: _invoiceTemplateVisibilityForMeta })
    visibility: InvoiceTemplateVisibilityValue;

    @ApiProperty({ enum: _invoiceTemplateTypeForMeta })
    type: InvoiceTemplateTypeValue;

    @ApiProperty()
    code: string;

    @ApiPropertyOptional()
    description?: string | null;

    @ApiProperty()
    counter: number;

    @ApiProperty()
    is_default: boolean;

    @ApiProperty()
    is_active: boolean;

    @ApiProperty()
    is_archived: boolean;

    @ApiPropertyOptional()
    archived_at?: Date | null;

    @ApiPropertyOptional()
    portal_id?: string | null;

    @ApiPropertyOptional()
    agent_id?: string | null;

    @ApiPropertyOptional()
    creator_bitrix_user_id?: string | null;

    @ApiPropertyOptional()
    created_at?: Date | null;

    @ApiPropertyOptional()
    updated_at?: Date | null;

    @ApiPropertyOptional({
        description: 'URL скачивания файла шаблона',
    })
    template_url?: string;

    static fromEntity(
        t: InvoiceTemplateLike,
        templateUrl?: string,
    ): InvoiceTemplateResponseDto {
        const dto = new InvoiceTemplateResponseDto();
        dto.id = t.id;
        dto.name = t.name;
        dto.visibility = t.visibility;
        dto.type = t.type;
        dto.code = t.code;
        dto.description = t.description;
        dto.counter = t.counter;
        dto.is_default = t.is_default;
        dto.is_active = t.is_active;
        dto.is_archived = t.is_archived;
        dto.archived_at = t.archived_at;
        dto.portal_id = t.portal_id != null ? String(t.portal_id) : null;
        dto.agent_id = t.agent_id != null ? String(t.agent_id) : null;
        dto.creator_bitrix_user_id =
            t.creator_bitrix_user_id != null
                ? String(t.creator_bitrix_user_id)
                : null;
        dto.created_at = t.created_at ?? undefined;
        dto.updated_at = t.updated_at ?? undefined;
        dto.template_url = templateUrl;
        return dto;
    }
}
