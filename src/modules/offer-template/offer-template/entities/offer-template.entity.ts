import { OfferTemplateFont } from '../../font/';
import { OfferTemplatePage } from '../../page/';
import { OfferTemplatePortal } from '../../portal/';
import { UserSelectedTemplate } from '../../user-selected/';

export class OfferTemplate {
    id?: string;
    name: string;
    visibility: 'public' | 'private' | 'user';
    is_default: boolean;
    file_path: string;
    demo_path?: string;
    type: string;
    rules?: string;
    price_settings?: string;
    infoblock_settings?: string;
    letter_text?: string;
    sale_text_1?: string;
    sale_text_2?: string;
    sale_text_3?: string;
    sale_text_4?: string;
    sale_text_5?: string;
    field_codes?: string;
    style?: string;
    color?: string;
    code: string;
    tags?: string;
    is_active: boolean;
    counter: number;
    created_at?: Date;
    updated_at?: Date;

    // Relations
    offerTemplateFonts?: OfferTemplateFont[];
    offerTemplatePages?: OfferTemplatePage[];
    offerTemplatePortal?: OfferTemplatePortal[];
    userSelectedTemplates?: UserSelectedTemplate[];

    constructor(partial: Partial<OfferTemplate>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            color: partial.color || undefined,
            style: partial.style || undefined,
            tags: partial.tags || undefined,
            demo_path: partial.demo_path || undefined,
            offerTemplateFonts: partial.offerTemplateFonts || undefined,
            offerTemplatePages: partial.offerTemplatePages || undefined,
            offerTemplatePortal: partial.offerTemplatePortal || undefined,
            userSelectedTemplates: partial.userSelectedTemplates || undefined,
        });
    }
}

export class OfferTemplateSummary {
    id: bigint | string;
    name: string;
    visibility: 'public' | 'private' | 'user';
    is_default: boolean;
    type: string;
    style?: string;
    color?: string;
    code: string;
    is_active: boolean;
    counter: number;
    created_at?: Date;

    constructor(partial: Partial<OfferTemplateSummary>) {
        Object.assign(this, {
            ...partial,
            created_at: partial.created_at || undefined,
            color: partial.color || undefined,
            style: partial.style || undefined,
        });
    }
}
