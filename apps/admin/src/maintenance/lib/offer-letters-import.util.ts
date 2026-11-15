import type { LegacyOfferLetter } from '@lib/portal-lib/konstructor';

/** Название письма, перенесённого из легаси-шаблона портала */
export const LEGACY_PORTAL_LETTER_NAME = 'Письмо портала';

/** Что делать с легаси-письмом: перенести, пропустить уже перенесённое или пустое */
export type LegacyLetterPlan = 'create' | 'exists' | 'empty';

export const planLegacyLetter = (
    letter: LegacyOfferLetter,
    importedFieldIds: ReadonlySet<number>,
): LegacyLetterPlan => {
    if (importedFieldIds.has(letter.fieldId)) return 'exists';
    if (!letter.text) return 'empty';
    return 'create';
};
