export const KNOWLEDGE_GENERAL_KIND = 'general';

export const KNOWLEDGE_KIND_PATTERN = /^[a-z][a-z0-9-]*$/;
export const KNOWLEDGE_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9.\-_]*$/i;

export interface KnowledgeDocument {
    /** Абсолютный путь к файлу на диске. */
    absolutePath: string;
    /** Имя файла без директории. */
    fileName: string;
    /** Папка-kind, из которой взят документ (general или конкретный тип). */
    kind: string;
    /** Откуда взята база: 'shared' для общей или имя домена. */
    source: string;
}

export const KNOWLEDGE_SHARED_SOURCE = 'shared';
