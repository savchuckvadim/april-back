import { Case, Gender, Engine, createLemma } from 'russian-nouns-js';

type GrammaticalCase = (typeof Case)[keyof typeof Case];
type GrammaticalGender = (typeof Gender)[keyof typeof Gender];

export type WordDeclensionOptions = {
    /** По умолчанию родительный («директора»). */
    grammaticalCase?: GrammaticalCase;
    /** По умолчанию мужской род (типично для должностей в документах). */
    gender?: GrammaticalGender;
};

const RUSSIAN_WORD = /^[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*$/u;

export class WordUtil {
    private static readonly engine = new Engine();

    /**
     * Склоняет слово или короткую фразу (несколько слов через пробел) по правилам русской морфологии.
     * Пример: «Директор» → «Директора» (родительный).
     */
    static declineWord(word: string, options?: WordDeclensionOptions): string {
        const trimmed = word.trim();
        if (!trimmed) {
            return '';
        }
        if (/\s/.test(trimmed)) {
            return this.declinePhrase(trimmed, options);
        }
        return this.declineSingleToken(trimmed, options);
    }

    /**
     * То же, что {@link declineWord}, но явно для строки из нескольких слов (каждое склоняется отдельно).
     */
    static declinePhrase(
        phrase: string,
        options?: WordDeclensionOptions,
    ): string {
        const parts = phrase.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
            return '';
        }
        return parts
            .map(part => this.declineSingleToken(part, options))
            .join(' ');
    }

    private static declineSingleToken(
        token: string,
        options?: WordDeclensionOptions,
    ): string {
        const grammaticalCase = options?.grammaticalCase ?? Case.GENITIVE;
        const gender = options?.gender ?? Gender.MASCULINE;

        if (this.shouldLeaveUnchanged(token)) {
            return token;
        }

        const isCapitalized = token[0] === token[0].toUpperCase();
        const lower = token.toLowerCase();

        try {
            const lemma = createLemma({
                text: lower,
                gender,
            });

            const forms = this.engine.decline(lemma, grammaticalCase);
            const raw = forms[0];
            if (!raw) {
                return token;
            }

            return isCapitalized ? this.capitalize(raw) : raw.toLowerCase();
        } catch {
            return token;
        }
    }

    private static shouldLeaveUnchanged(token: string): boolean {
        if (token.length < 3) {
            return true;
        }
        if (!RUSSIAN_WORD.test(token)) {
            return true;
        }
        if (/\d/.test(token)) {
            return true;
        }
        if (this.isAllCapsAbbreviation(token)) {
            return true;
        }
        return false;
    }

    /** ООО, УК и т.п. — не склоняем. */
    private static isAllCapsAbbreviation(token: string): boolean {
        const hasUpper = /[А-ЯЁA-Z]/.test(token);
        const hasLower = /[а-яёa-z]/.test(token);
        return hasUpper && !hasLower;
    }

    private static capitalize(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }
}
