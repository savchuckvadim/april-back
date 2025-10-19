import { PageType } from "../../page/dtos/create-offer-template-page.dto";
import { OfferTemplatePageDto } from "../../page/dtos/offer-template-page.dto";
import { OfferTemplateVisibility } from "../dtos/create-offer-template.dto";
import { OfferTemplateColorsDto, OfferTemplateDto, OfferTemplateSummaryDto } from "../dtos/offer-template.dto";
import { OfferTemplate, OfferTemplateSummary } from "../entities/offer-template.entity";
import { OfferTemplateFontDto } from "../../font/dtos/offer-template-font.dto";

export const templateResponseMap = (templates: OfferTemplateSummary[]) => {
    const pages = templates.map(template => {

        return new OfferTemplatePageDto({
            ...template,
            id: String(template.id),
            type: template.type as PageType,
        });
    });
    return templates.map(template => new OfferTemplateSummaryDto({
        ...template,
        id: String(template.id),


    }));
};
export class OfferTemplateMapper {
    static toSummaryDto(entity: OfferTemplate): OfferTemplateSummaryDto {
        return {
            id: entity.id || '',
            name: entity.name,
            visibility: entity.visibility as OfferTemplateVisibility,
            is_default: entity.is_default,
            type: entity.type,
            style: entity.style || '',
            color: entity.color || '',
            code: entity.code,
            is_active: entity.is_active,
            counter: entity.counter,
            created_at: entity.created_at,
            pages: entity.offerTemplatePages?.map(p => new OfferTemplatePageDto({
                ...p,
                id: String(p.id),
                type: p.type as PageType,
            })) || [],


        };
    }

    static toFullDto(entity: OfferTemplate): OfferTemplateDto {

        const pages = entity.offerTemplatePages?.map(p => new OfferTemplatePageDto({
            ...p,
            id: String(p.id),
            type: p.type as PageType,
        })) || []
        const fonts = entity.offerTemplateFonts?.map(f => new OfferTemplateFontDto({
            ...f,
            id: BigInt(f.id),
            name: f.name,

        })) || []
        const colors = entity.color ? JSON.parse(entity.color) : null;
        return {
            id: entity.id || '',
            name: entity.name,
            tags: entity.tags || '',
            sale_text_1: entity.sale_text_1 || '',
            sale_text_2: entity.sale_text_2 || '',
            sale_text_3: entity.sale_text_3 || '',
            sale_text_4: entity.sale_text_4 || '',
            sale_text_5: entity.sale_text_5 || '',
            file_path: entity.file_path,
            pages,
            fonts,
            visibility: entity.visibility as OfferTemplateVisibility,
            is_default: entity.is_default,
            type: entity.type,
            style: entity.style || '',
            colors: colors as OfferTemplateColorsDto,
            code: entity.code,
            is_active: entity.is_active,
            counter: entity.counter,
            created_at: entity.created_at,
        };
    }
}
