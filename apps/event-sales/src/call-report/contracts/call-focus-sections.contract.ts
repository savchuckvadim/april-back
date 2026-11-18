import { CALL_REPORT_SECTIONS } from '@lib/call-lib';
import { SECTION_ITEM_SCHEMA } from './call-deep-analysis.contract';
import { SECTION_EVIDENCE_PROPERTIES } from './call-evidence.contract';

/**
 * Зоны фокус-проходов: какой проход отвечает за какие разделы смарта.
 * Вынесено из call-focus-analysis.contract.ts, чтобы схемы проходов лежали в
 * отдельных файлах и не зависели друг от друга по кругу.
 */

/**
 * Ключи фокус-проходов в порядке сборки. Единственный список: сборка,
 * хранение ответов, догон и сервис берут ключи отсюда.
 */
export const FOCUS_KEYS = ['form', 'content', 'movement', 'closing'] as const;

export type CallFocusKey = (typeof FOCUS_KEYS)[number];

/**
 * Разделы каждого фокуса (union == все коды разделов смарта, без
 * пересечений — проверяется тестом).
 */
export const FOCUS_SECTION_CODES: Record<CallFocusKey, readonly string[]> = {
    form: ['GREETING'],
    content: ['NEEDS', 'PRESENTATION'],
    movement: ['OBJECTIONS', 'PRICE'],
    closing: ['CLOSING', 'REFUSAL'],
};

/** Каталог разделов конкретного фокуса для промпта. */
export function focusCatalog(focus: CallFocusKey): string {
    return CALL_REPORT_SECTIONS.filter(section =>
        FOCUS_SECTION_CODES[focus].includes(section.code),
    )
        .map(section => `- '${section.code}' — ${section.title}`)
        .join('\n');
}

/**
 * sections-подсхема, ограниченная кодами фокуса. quoteEvidence — у записи
 * раздела ещё цитата-доказательство и секунда (focus-v3.4); без него
 * подсхема прежняя байт в байт.
 */
export function focusSectionsSchema(
    focus: CallFocusKey,
    quoteEvidence = false,
): Record<string, unknown> {
    const items = {
        ...SECTION_ITEM_SCHEMA,
        properties: {
            ...SECTION_ITEM_SCHEMA.properties,
            section: {
                type: 'string',
                enum: [...FOCUS_SECTION_CODES[focus]],
                description:
                    'Код раздела; каждый код — не более одной записи в sections',
            },
        },
    };
    return {
        type: 'array',
        items: quoteEvidence
            ? {
                  ...items,
                  properties: {
                      ...items.properties,
                      ...SECTION_EVIDENCE_PROPERTIES,
                  },
                  required: [
                      ...items.required,
                      ...Object.keys(SECTION_EVIDENCE_PROPERTIES),
                  ],
              }
            : items,
    };
}
