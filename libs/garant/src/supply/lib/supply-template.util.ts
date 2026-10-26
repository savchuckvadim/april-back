import { convert as convertNumberToWordsRu } from 'number-to-words-ru';

/**
 * Шаблоны текстов поставки (договор, лицензионный/абонентский договор, КП)
 * зависят только от числа одновременных доступов (ОД). Одна строка в БД
 * покрывает и справочные поставки (internet_5), и произвольное X-ОД
 * (x_internet_7). Плейсхолдеры описаны в миграции
 * online/…/2026_10_24_100000_add_contract_text_templates_to_supplies.php.
 */

/** Текстовые поля поставки, которые резолвятся по коду (порядок — как в легаси SupplyDto). */
export const SUPPLY_TEXT_FIELDS = [
    'contractName',
    'contractProp1',
    'contractProp2',
    'contractPropSuppliesQuantity',
    'contractPropLoginsQuantity',
    'contractPropComment',
    'contractPropEmail',
    'quantityForKp',
    'lcontractName',
    'lcontractProp2',
    'lcontractPropComment',
    'lcontractPropEmail',
    'acontractName',
    'acontractPropComment',
] as const;

export type SupplyTextField = (typeof SUPPLY_TEXT_FIELDS)[number];
export type SupplyTexts = Record<SupplyTextField, string | null>;
/** Шаблоны — те же поля, но до подстановки числа. */
export type SupplyTextTemplates = Partial<
    Record<SupplyTextField, string | null>
>;

type CaseKey = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'pre';
type GenderKey = 'm' | 'f' | 'n';

const DECLENSION: Record<
    CaseKey,
    | 'nominative'
    | 'genitive'
    | 'dative'
    | 'accusative'
    | 'instrumental'
    | 'prepositional'
> = {
    nom: 'nominative',
    gen: 'genitive',
    dat: 'dative',
    acc: 'accusative',
    ins: 'instrumental',
    pre: 'prepositional',
};

const GENDER: Record<GenderKey, 0 | 1 | 2> = { m: 0, f: 1, n: 2 };

const EMPTY_CASES: [string, string] = ['', ''];
const emptyDeclensions = () => ({
    nominative: EMPTY_CASES,
    genitive: EMPTY_CASES,
    dative: EMPTY_CASES,
    accusative: EMPTY_CASES,
    instrumental: EMPTY_CASES,
    prepositional: EMPTY_CASES,
});

/** Целое число прописью без «валюты»: `numberToWords(2, 'gen', 'm')` → «двух». */
export const numberToWords = (
    value: number,
    grammaticalCase: CaseKey = 'nom',
    gender: GenderKey = 'm',
): string =>
    convertNumberToWordsRu(Math.trunc(Math.abs(value)), {
        currency: {
            currencyNameCases: ['', '', ''],
            currencyNameDeclensions: emptyDeclensions(),
            fractionalPartNameCases: ['', '', ''],
            fractionalPartNameDeclensions: emptyDeclensions(),
            currencyNounGender: { integer: GENDER[gender], fractionalPart: 0 },
        },
        declension: DECLENSION[grammaticalCase],
        showNumberParts: { integer: true, fractional: false },
        showCurrency: { integer: false, fractional: false },
    })
        .trim()
        .toLowerCase();

/** Русская форма по числу: 1 доступ / 2 доступа / 5 доступов (и 21 / 22 / 25). */
export const pluralize = (
    value: number,
    one: string,
    few: string,
    many: string,
): string => {
    const n = Math.abs(Math.trunc(value));
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
};

const capitalize = (text: string) =>
    text ? text.charAt(0).toUpperCase() + text.slice(1) : text;

const WORDS_RE =
    /\{(words|Words)(?::(nom|gen|dat|acc|ins|pre))?(?::(m|f|n))?\}/g;
const PLURAL_RE = /\{plural:([^|}]*)\|([^|}]*)\|([^|}]*)\}/g;
const NUMBER_RE = /\{n\}/g;

/**
 * Подставляет число ОД в шаблон. null/undefined остаётся null — поле
 * у поставки не задано; строка без плейсхолдеров возвращается как есть.
 */
export const renderSupplyTemplate = (
    template: string | null | undefined,
    quantity: number,
): string | null => {
    if (template === null || template === undefined) return null;
    return template
        .replace(NUMBER_RE, String(quantity))
        .replace(
            WORDS_RE,
            (_match, form: string, caseKey?: string, gender?: string) => {
                const words = numberToWords(
                    quantity,
                    (caseKey as CaseKey | undefined) ?? 'nom',
                    (gender as GenderKey | undefined) ?? 'm',
                );
                return form === 'Words' ? capitalize(words) : words;
            },
        )
        .replace(PLURAL_RE, (_match, one: string, few: string, many: string) =>
            pluralize(quantity, one, few, many),
        );
};

/** Рендер всех текстовых полей поставки для заданного числа ОД. */
export const renderSupplyTexts = (
    templates: SupplyTextTemplates,
    quantity: number,
): SupplyTexts =>
    SUPPLY_TEXT_FIELDS.reduce((acc, field) => {
        acc[field] = renderSupplyTemplate(templates[field], quantity);
        return acc;
    }, {} as SupplyTexts);
