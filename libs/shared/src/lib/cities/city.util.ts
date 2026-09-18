/**
 * ГОРОДА И ИХ ЖИТЕЙСКИЕ НАЗВАНИЯ.
 *
 * Люди пишут город как придётся: в лиде «Питер», отдел называется
 * «ОП САНКТ-ПЕТЕРБУРГ (ОП)», в регионе заявки — «Ленинградская область».
 * Сравнение строк такие пары не связывает, и 18.09.2026 ночная питерская
 * заявка ушла в Воронеж именно поэтому.
 *
 * Здесь один список синонимов на всё приложение: им пользуется выбор отдела
 * продаж, им же можно пользоваться в отчётах и разборе адресов. Список
 * дополняется по мере появления новых написаний — это его нормальная жизнь.
 */

/** Город с каноническим названием и всеми написаниями, что встречались. */
export interface ICityAliases {
    /** Как город называется «по паспорту». */
    canonical: string;
    /** Народные и сокращённые написания, включая области. */
    aliases: readonly string[];
}

export const CITY_ALIASES: readonly ICityAliases[] = [
    {
        canonical: 'Санкт-Петербург',
        aliases: [
            'спб',
            'питер',
            'санкт петербург',
            'петербург',
            'ленинград',
            'ленинградская область',
            'ленобласть',
        ],
    },
    {
        canonical: 'Ростов-на-Дону',
        aliases: ['ростов', 'ростов на дону', 'рнд', 'ростовская область'],
    },
    {
        canonical: 'Воронеж',
        aliases: ['воронежская область'],
    },
    {
        canonical: 'Москва',
        aliases: ['мск', 'московская область', 'подмосковье'],
    },
    {
        canonical: 'Екатеринбург',
        aliases: ['екб', 'свердловская область'],
    },
    {
        canonical: 'Нижний Новгород',
        aliases: ['нижний', 'нн', 'нижегородская область'],
    },
];

/**
 * Написание к сравнимому виду: нижний регистр, `ё` как `е`, дефисы и знаки
 * препинания как пробелы, лишние пробелы схлопнуты.
 */
export function normalizeCityText(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

/** Каноническое название города по любому написанию; не узнали — null. */
export function canonicalCity(raw: string | null | undefined): string | null {
    const text = normalizeCityText(raw ?? '');
    if (!text) return null;
    for (const city of CITY_ALIASES) {
        for (const name of [city.canonical, ...city.aliases]) {
            if (containsWord(text, normalizeCityText(name))) {
                return city.canonical;
            }
        }
    }
    return null;
}

/** Один ли это город: «Питер» и «ОП САНКТ-ПЕТЕРБУРГ (ОП)» — да. */
export function sameCity(
    left: string | null | undefined,
    right: string | null | undefined,
): boolean {
    const first = canonicalCity(left);
    return first !== null && first === canonicalCity(right);
}

/** Известные города списком — для подсказок в интерфейсе и проверок. */
export function getCities(): string[] {
    return CITY_ALIASES.map(city => city.canonical);
}

/**
 * Название встречается в тексте отдельным словом (или словосочетанием).
 *
 * Именно словом, а не подстрокой: иначе «нн» нашлось бы в «Инновации», а
 * «мск» — в «Томск».
 */
function containsWord(text: string, name: string): boolean {
    if (!name) return false;
    if (text === name) return true;
    const words = text.split(' ');
    const parts = name.split(' ');
    for (let i = 0; i + parts.length <= words.length; i += 1) {
        if (parts.every((part, shift) => words[i + shift] === part))
            return true;
    }
    return false;
}
