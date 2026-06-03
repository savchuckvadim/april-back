/**
 * Рантайм-объекты + строковые литералы (совпадают с Prisma enum по значению).
 * Тип выводим от отдельной константы, без `typeof` от того же символа, что экспортируем —
 * иначе в projectService ESLint иногда получает внутренний тип `error`.
 */
const invoiceTemplateVisibilitySchema = {
    PUBLIC: 'public',
    PORTAL: 'portal',
    PROVIDER: 'provider',
} as const;

export const InvoiceTemplateVisibility = invoiceTemplateVisibilitySchema;

export type InvoiceTemplateVisibilityValue =
    (typeof invoiceTemplateVisibilitySchema)[keyof typeof invoiceTemplateVisibilitySchema];

const invoiceTemplateTypeSchema = {
    WORD: 'word',
    EXCEL: 'excel',
    PDF: 'pdf',
    HTML: 'html',
    OTHER: 'other',
} as const;

export const InvoiceTemplateType = invoiceTemplateTypeSchema;

export type InvoiceTemplateTypeValue =
    (typeof invoiceTemplateTypeSchema)[keyof typeof invoiceTemplateTypeSchema];
