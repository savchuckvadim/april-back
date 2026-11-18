import {
    CHECKLIST_EVIDENCE_SPEC,
    FIVE_K_EVIDENCE_SCHEMA,
    HVOST_EVIDENCE_SCHEMA,
    NEED_ITEMS_SCHEMA,
    NEED_ITEMS_SPEC,
    SECTION_EVIDENCE_SPEC,
    checklistsAskedFor,
    renderEvidenceBlock,
} from './call-evidence.contract';
import {
    FOCUS_CONTENT_SCHEMA,
    FOCUS_FORM_PROMPT,
    FOCUS_FORM_SCHEMA,
    focusContentPrompt,
} from './call-focus-analysis.contract';
import {
    CLOSING_CHECKLIST_PROPERTIES,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
    focusClosingPrompt,
    focusClosingSchema,
} from './call-focus-deal.contract';
import {
    focusSectionsSchema,
    type CallFocusKey,
} from './call-focus-sections.contract';

/**
 * Задание фокус-проходов С ЦИТАТАМИ (focus-v3.4): то же прежнее задание
 * плюс цитата и секунда у разделов, потребности с местом в разговоре
 * (`needItems` вместо `needs`), места пунктов «хвоста» и 5К; «хвост» и 5К —
 * только у презентации. Прежние схемы и тексты не меняются — задание с
 * цитатами строится из них.
 */

/** Задание одного прохода: системный текст и схема ответа. */
export interface FocusPassContract {
    prompt: string;
    schema: Record<string, unknown>;
}

type SchemaEntry = readonly [string, unknown];

/**
 * Схема с изменёнными полями: порядок полей сохраняется, required — все
 * поля в том же порядке (strict-режим поставщика).
 */
function withProperties(
    schema: Record<string, unknown>,
    edit: (entry: SchemaEntry) => SchemaEntry,
): Record<string, unknown> {
    const properties = Object.fromEntries(
        Object.entries(schema.properties as Record<string, unknown>).map(edit),
    );
    return { ...schema, properties, required: Object.keys(properties) };
}

/** Разделы прохода — с цитатой и секундой. */
const sectionsWithEvidence =
    (focus: CallFocusKey) =>
    ([key, value]: SchemaEntry): SchemaEntry =>
        key === 'sections'
            ? [key, focusSectionsSchema(focus, true)]
            : [key, value];

const FORM: FocusPassContract = {
    prompt: FOCUS_FORM_PROMPT + renderEvidenceBlock([SECTION_EVIDENCE_SPEC]),
    schema: withProperties(FOCUS_FORM_SCHEMA, sectionsWithEvidence('form')),
};

const CONTENT: FocusPassContract = {
    prompt:
        focusContentPrompt(NEED_ITEMS_SPEC) +
        renderEvidenceBlock([SECTION_EVIDENCE_SPEC]),
    schema: withProperties(FOCUS_CONTENT_SCHEMA, entry =>
        entry[0] === 'needs'
            ? ['needItems', NEED_ITEMS_SCHEMA]
            : sectionsWithEvidence('content')(entry),
    ),
};

const MOVEMENT: FocusPassContract = {
    prompt:
        FOCUS_MOVEMENT_PROMPT + renderEvidenceBlock([SECTION_EVIDENCE_SPEC]),
    schema: withProperties(
        FOCUS_MOVEMENT_SCHEMA,
        sectionsWithEvidence('movement'),
    ),
};

/** «Закрытие» презентации: «хвост» и 5К с местами пунктов. */
const CLOSING_WITH_CHECKLISTS: FocusPassContract = {
    prompt:
        focusClosingPrompt(true) +
        renderEvidenceBlock([SECTION_EVIDENCE_SPEC, CHECKLIST_EVIDENCE_SPEC]),
    schema: focusClosingSchema(focusSectionsSchema('closing', true), {
        ...CLOSING_CHECKLIST_PROPERTIES,
        hvostEvidence: HVOST_EVIDENCE_SCHEMA,
        fiveKEvidence: FIVE_K_EVIDENCE_SCHEMA,
    }),
};

/** «Закрытие» остальных типов: «хвоста» и 5К в задании нет вовсе. */
const CLOSING_PLAIN: FocusPassContract = {
    prompt:
        focusClosingPrompt(false) +
        renderEvidenceBlock([SECTION_EVIDENCE_SPEC]),
    schema: focusClosingSchema(focusSectionsSchema('closing', true), {}),
};

/** Задание прохода с цитатами для звонка этого типа. */
export function quotePassContract(
    key: CallFocusKey,
    callType: string | null,
): FocusPassContract {
    switch (key) {
        case 'form':
            return FORM;
        case 'content':
            return CONTENT;
        case 'movement':
            return MOVEMENT;
        case 'closing':
            return checklistsAskedFor(callType)
                ? CLOSING_WITH_CHECKLISTS
                : CLOSING_PLAIN;
    }
}
