import { Injectable } from '@nestjs/common';
import { Case } from 'russian-nouns-js';
import { NameUtil } from '@lib/shared/lib/utils/name';
import { WordUtil } from '@lib/shared/lib/utils/word';
import { RqCaseKind, RqGrammaticalCase } from '../dto/case.dto';

/** Окончания полных прилагательных мужского и женского рода в именительном. */
const ADJECTIVE = /(?:ый|ий|ой|ая|яя)$/iu;

const NOUN_CASE: Record<RqGrammaticalCase, (typeof Case)[keyof typeof Case]> = {
    [RqGrammaticalCase.GENITIVE]: Case.GENITIVE,
    [RqGrammaticalCase.DATIVE]: Case.DATIVE,
};

/**
 * Падеж для ФИО, должности и основания: родительный — реквизиты и договор
 * («в лице Генерального директора Иванова»), дательный — адресат КП
 * («Генеральному директору Иванову»). Замена эндпоинтов case (event-service,
 * pymorphy2) и nameCase/wordCase (Laravel): ФИО — lvovich, слова — russian-nouns-js.
 */
@Injectable()
export class RqCaseService {
    decline(
        value: string,
        kind: RqCaseKind = RqCaseKind.WORD,
        grammaticalCase: RqGrammaticalCase = RqGrammaticalCase.GENITIVE,
    ): string {
        const trimmed = value.trim();
        if (!trimmed) return '';
        return kind === RqCaseKind.PERSON
            ? NameUtil.declineWord(trimmed, grammaticalCase)
            : this.declineHeadPhrase(trimmed, grammaticalCase);
    }

    /**
     * Должность склоняется по главной части: прилагательные до первого
     * существительного и само существительное, остальное уже в нужной форме
     * («Заместитель генерального директора» → «Заместителю генерального
     * директора»). Сокращение в начале («Ген. директор») не трогаем, как легаси.
     */
    private declineHeadPhrase(
        phrase: string,
        grammaticalCase: RqGrammaticalCase,
    ): string {
        const words = phrase.split(/\s+/);
        if (words[0]?.endsWith('.')) return phrase;
        const options = { grammaticalCase: NOUN_CASE[grammaticalCase] };
        let head = true;
        return words
            .map(word => {
                if (!head) return word;
                const declined = WordUtil.declineWord(word, options);
                if (!ADJECTIVE.test(word)) head = false;
                return declined;
            })
            .join(' ');
    }
}
