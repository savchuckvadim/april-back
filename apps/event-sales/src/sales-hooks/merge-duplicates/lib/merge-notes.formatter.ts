import { MergeConflictNote } from './merge-harmonize';

/** Что известно о поле из `crm.*.fields`: подпись, тип и варианты списка. */
export interface MergeFieldMeta {
    title: string;
    type: string;
    /** Варианты списка: id → подпись. */
    options: Record<string, string>;
}

export type MergeFieldsMeta = Record<string, MergeFieldMeta>;

const MAX_VALUE_LENGTH = 200;
const MAX_COMMENT_LENGTH = 3500;

/** Ссылки CRM в значениях полей: префикс → как назвать человеку. */
const CRM_LINK_PREFIX: Record<string, string> = {
    CO: 'компания',
    C: 'контакт',
    D: 'сделка',
    L: 'лид',
};

const clip = (text: string, max: number): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text;

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

/** Подписи, типы и варианты полей из ответа `crm.*.fields`. */
export const toFieldsMeta = (raw: unknown): MergeFieldsMeta => {
    if (!raw || typeof raw !== 'object') return {};
    const result: MergeFieldsMeta = {};
    for (const [code, value] of Object.entries(
        raw as Record<string, unknown>,
    )) {
        if (!value || typeof value !== 'object') continue;
        const meta = value as Record<string, unknown>;
        const title =
            [meta.listLabel, meta.formLabel, meta.filterLabel, meta.title]
                .map(textOf)
                .find(label => label !== '' && !/^UF_/i.test(label)) ?? '';
        const options: Record<string, string> = {};
        if (Array.isArray(meta.items)) {
            for (const item of meta.items as Record<string, unknown>[]) {
                const rawId = item?.ID;
                const id =
                    typeof rawId === 'string' || typeof rawId === 'number'
                        ? String(rawId)
                        : '';
                const label = textOf(item?.VALUE);
                if (id && label) options[id] = label;
            }
        }
        result[code] = { title, type: textOf(meta.type), options };
    }
    return result;
};

/** Значение поля по-человечески: вариант списка, «да/нет», ссылка CRM. */
export const describeValue = (
    meta: MergeFieldMeta | undefined,
    value: string,
): string => {
    if (meta?.options[value]) return meta.options[value];
    if (meta?.type === 'boolean') {
        return ['1', 'Y', 'true'].includes(value) ? 'да' : 'нет';
    }
    if (meta?.type === 'employee') return `сотрудник ${value}`;
    const link = value.match(/^([A-Z]{1,2})_(\d+)$/);
    if (link && CRM_LINK_PREFIX[link[1]]) {
        return `${CRM_LINK_PREFIX[link[1]]} ${link[2]}`;
    }
    return clip(value, MAX_VALUE_LENGTH);
};

/**
 * Запись в ленту главной карточки: какие значения дублей уступили ей при
 * объединении. Без неё «объединить по-любому» значило бы молча потерять
 * расходившиеся данные. Коды полей наружу не показываются — только подписи.
 *
 * @returns null — расхождений не было, писать нечего.
 */
export const formatMergeNotes = (input: {
    notes: readonly MergeConflictNote[];
    fields: MergeFieldsMeta;
    victimTitles: ReadonlyMap<number, string>;
}): string | null => {
    if (!input.notes.length) return null;

    const byVictim = new Map<number, MergeConflictNote[]>();
    for (const note of input.notes) {
        const list = byVictim.get(note.victimId) ?? [];
        list.push(note);
        byVictim.set(note.victimId, list);
    }

    const lines = [
        'Объединение дублей: у присоединённых карточек некоторые поля были ' +
            'заполнены иначе. В этой карточке оставлены её значения, прежние ' +
            'значения дублей — ниже.',
    ];
    for (const [victimId, notes] of byVictim) {
        const title = input.victimTitles.get(victimId)?.trim();
        lines.push(
            '',
            title ? `«${title}» (№${victimId}):` : `Дубль №${victimId}:`,
        );
        for (const note of notes) {
            const meta = input.fields[note.field];
            const label = meta?.title || 'Дополнительное поле';
            lines.push(
                `• ${label}: было «${describeValue(meta, note.victimValue)}», ` +
                    `оставлено «${describeValue(meta, note.keptValue)}»`,
            );
        }
    }
    return clip(lines.join('\n'), MAX_COMMENT_LENGTH);
};
