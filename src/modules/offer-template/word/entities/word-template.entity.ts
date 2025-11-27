import { OfferTemplate } from '../../offer-template/entities/offer-template.entity';

/**
 * WordTemplate entity - обертка над OfferTemplate для Word шаблонов
 * Использует ту же сущность DB, но без pages и blocks
 */
export class WordTemplate {
    id?: string;
    name: string;
    visibility: 'public' | 'private' | 'user';
    is_default: boolean;
    file_path: string; // путь к docx файлу в хранилище
    demo_path?: string;
    type: string; // должен быть 'word'
    code: string;
    tags?: string;
    is_active: boolean;
    counter: number;
    created_at?: Date;
    updated_at?: Date;

    // Дополнительные поля для Word шаблонов
    template_url?: string; // URL для скачивания шаблона

    constructor(partial: Partial<WordTemplate>) {
        Object.assign(this, {
            ...partial,
            // Преобразуем BigInt в string для сериализации
            id: partial.id ? String(partial.id) : partial.id,
            created_at: partial.created_at || undefined,
            updated_at: partial.updated_at || undefined,
            tags: partial.tags || undefined,
            demo_path: partial.demo_path || undefined,
            template_url: partial.template_url || undefined,
        });
    }

    /**
     * Преобразует OfferTemplate в WordTemplate
     */
    static fromOfferTemplate(template: OfferTemplate): WordTemplate {
        return new WordTemplate({
            id: template.id,
            name: template.name,
            visibility: template.visibility,
            is_default: template.is_default,
            file_path: template.file_path,
            demo_path: template.demo_path,
            type: template.type,
            code: template.code,
            tags: template.tags,
            is_active: template.is_active,
            counter: template.counter,
            created_at: template.created_at,
            updated_at: template.updated_at,
        });
    }

    /**
     * Преобразует WordTemplate в OfferTemplate (для сохранения)
     */
    toOfferTemplate(): Partial<OfferTemplate> {
        return {
            name: this.name,
            visibility: this.visibility,
            is_default: this.is_default,
            file_path: this.file_path,
            demo_path: this.demo_path,
            type: this.type || 'word',
            code: this.code,
            tags: this.tags,
            is_active: this.is_active,
            counter: this.counter,
        };
    }
}

export class WordTemplateSummary {
    id: bigint | string;
    name: string;
    visibility: 'public' | 'private' | 'user';
    is_default: boolean;
    type: string;
    code: string;
    is_active: boolean;
    counter: number;
    created_at?: Date;
    template_url?: string;

    constructor(partial: Partial<WordTemplateSummary>) {
        Object.assign(this, {
            ...partial,
            // Преобразуем BigInt в string для сериализации
            id: partial.id ? String(partial.id) : partial.id,
            created_at: partial.created_at || undefined,
            template_url: partial.template_url || undefined,
        });
    }
}

