import { incline } from 'lvovich';
import type { FioT } from 'lvovich/lib/gender';

export class NameUtil {
    /**
     * Склоняет слово в родительный падеж (genitive)
     * @param word - слово для склонения
     * @returns склоненное слово
     */
    static declineWord(word: string): string {
        if (!word || word.trim() === '') {
            return '';
        }

        const originalWord = word.trim();
        const isCapitalized = originalWord[0] === originalWord[0].toUpperCase();

        try {
            // Пытаемся склонить как ФИО
            const fioParts = this.splitFullName(originalWord);

            // Если это похоже на ФИО (3 части), склоняем как ФИО
            if (fioParts.last && fioParts.first && fioParts.middle) {
                const inflected = incline(fioParts, 'genitive');
                const result = `${inflected.last} ${inflected.first} ${inflected.middle}`;
                return isCapitalized
                    ? this.capitalizeWords(result)
                    : result.toLowerCase();
            }

            // Если это два слова, пытаемся склонить как ФИО (фамилия + имя)
            if (fioParts.last && fioParts.first) {
                const inflected = incline(fioParts, 'genitive');
                const result = `${inflected.last} ${inflected.first}`;
                return isCapitalized
                    ? this.capitalizeWords(result)
                    : result.toLowerCase();
            }

            // Если это одно слово, пытаемся склонить как фамилию
            if (fioParts.last) {
                try {
                    const singleFio: FioT = {
                        last: fioParts.last,
                        first: null,
                        middle: null,
                    };
                    const inflected = incline(singleFio, 'genitive');
                    const result = inflected.last || originalWord;
                    return isCapitalized
                        ? this.capitalize(result)
                        : result.toLowerCase();
                } catch {
                    // Если не удалось склонить, возвращаем исходное слово
                    return originalWord;
                }
            }

            return originalWord;
        } catch {
            // Если не удалось склонить, возвращаем исходное слово
            return originalWord;
        }
    }

    /**
     * Разбивает полное имя на части
     */
    private static splitFullName(fullName: string): FioT {
        const parts = fullName.trim().split(/\s+/);
        return {
            last: parts[0] || null,
            first: parts[1] || null,
            middle: parts[2] || null,
        };
    }

    /**
     * Делает первую букву заглавной
     */
    private static capitalize(str: string): string {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    /**
     * Делает первую букву каждого слова заглавной
     */
    private static capitalizeWords(str: string): string {
        if (!str) return str;
        return str
            .split(' ')
            .map(word => this.capitalize(word))
            .join(' ');
    }
}
