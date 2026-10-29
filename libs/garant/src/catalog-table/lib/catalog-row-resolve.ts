import {
    CONSALTING_PACKAGES,
    COMPLECT_NUMBER_TO_CODE,
    LT_PACKAGE_NAMES,
    LT_PACKAGE_NUMBER_TO_CODE,
    LT_PACKAGE_WEIGHTS,
    STAR_PACKAGE_CODE,
    STAR_PACKAGE_FULL_NAME,
    STAR_PACKAGE_NAME,
    SUPPLY_COEFFICIENTS,
    SUPPLY_NUMBER_TO_KEY,
    UNIVERSAL_COMPLECT_ABS,
    UNIVERSAL_COMPLECT_NAMES,
    UNIVERSAL_COMPLECT_NUMBERS,
    UNIVERSAL_COMPLECT_WEIGHTS,
    supplyCodeFromNumber,
} from '../../catalog-install/lib/catalog-codes';

/**
 * Разрешение строки таблицы в код каталога.
 *
 * Таблица владельца адресует строки по именам («Гарант-Классик») и по
 * своим кодам из легаси-выгрузки («lt_small_pac»), а конструктор ищет
 * цену строго по кодам фронта («classic», «ltpackSmall»). Поэтому при
 * создании отсутствующей записи код берётся НЕ из файла, а из эталонной
 * сетки — иначе запись появится, но конструктор её не найдёт.
 *
 * Сопоставление по имени: регистр, пробелы и дефисы не важны, префикс
 * «Гарант-» необязателен — в выгрузках встречаются оба написания.
 */

/** Ключ сравнения имён: без регистра, пробелов, дефисов и префикса «гарант» */
export const nameKey = (value: string): string =>
    value
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[\s\-–—]/g, '')
        .replace(/^гарант/, '');

export interface UniversalComplectRef {
    code: string;
    name: string;
    number: number;
    weight: number;
    abs: number;
}

/** Эталонная универсальная линейка: код фронта, имя, вес и АБС */
export const UNIVERSAL_COMPLECT_REFS: readonly UniversalComplectRef[] =
    UNIVERSAL_COMPLECT_NUMBERS.map(number => ({
        code: COMPLECT_NUMBER_TO_CODE[number],
        name: UNIVERSAL_COMPLECT_NAMES[number],
        number,
        weight: UNIVERSAL_COMPLECT_WEIGHTS[number] ?? 0,
        abs: UNIVERSAL_COMPLECT_ABS[number],
    }));

/** Эталонный универсальный комплект по имени из таблицы */
export const universalRefByName = (
    name: string,
): UniversalComplectRef | null => {
    const key = nameKey(name);
    return (
        UNIVERSAL_COMPLECT_REFS.find(ref => nameKey(ref.name) === key) ?? null
    );
};

export interface PackageRef {
    code: string;
    name: string;
    fullName: string;
    number: number;
    weight?: number;
}

/** Эталонные пакеты ЛегалТех */
export const LT_PACKAGE_REFS: readonly PackageRef[] = Object.entries(
    LT_PACKAGE_NUMBER_TO_CODE,
).map(([number, code]) => ({
    code,
    name: LT_PACKAGE_NAMES[code] ?? code,
    fullName: LT_PACKAGE_NAMES[code] ?? code,
    number: Number(number),
    weight: LT_PACKAGE_WEIGHTS[code],
}));

/** Эталонный пакет СТАР (в каталоге один) */
export const STAR_PACKAGE_REFS: readonly PackageRef[] = [
    {
        code: STAR_PACKAGE_CODE,
        name: STAR_PACKAGE_NAME,
        fullName: STAR_PACKAGE_FULL_NAME,
        number: 0,
    },
];

/** Эталонные продукты консалтинга */
export const CONSALTING_PACKAGE_REFS: readonly PackageRef[] =
    CONSALTING_PACKAGES.map(item => ({
        code: item.code,
        name: item.name,
        fullName: item.fullName,
        number: item.number,
    }));

/**
 * Эталонный пакет по строке таблицы. Сначала по коду (файл скачан из
 * системы — код уже наш), затем по имени (файл из легаси-выгрузки с
 * чужими кодами), затем по полному имени.
 */
export const packageRefByRow = (
    refs: readonly PackageRef[],
    code: string,
    name: string,
): PackageRef | null => {
    const byCode = refs.find(ref => ref.code === code);
    if (byCode) return byCode;
    const key = nameKey(name);
    if (key === '') return null;
    return (
        refs.find(
            ref => nameKey(ref.name) === key || nameKey(ref.fullName) === key,
        ) ?? null
    );
};

export interface SupplyRef {
    code: string;
    type: 'internet' | 'proxima';
    name: string;
    usersQuantity: number;
    coefficient: number;
}

/** Эталонная сетка видов поставки: 19 записей с кодами и коэффициентами */
export const SUPPLY_REFS: readonly SupplyRef[] = Object.entries(
    SUPPLY_NUMBER_TO_KEY,
)
    .map(([number, key]): SupplyRef | null => {
        const code = supplyCodeFromNumber(Number(number));
        if (!code) return null;
        return {
            code,
            type: key.type,
            name: key.name,
            usersQuantity: key.usersQuantity,
            coefficient: SUPPLY_COEFFICIENTS[Number(number)] ?? 1,
        };
    })
    .filter((ref): ref is SupplyRef => ref !== null);

/**
 * Эталонные виды поставки для колонки прайса с данным числом ОД.
 * Особые поставки (Стандартная, Локальная, Флэш) берут колонку «1 ОД» —
 * своей в прайсе у них нет.
 */
export const supplyRefsForOd = (usersQuantity: number): SupplyRef[] =>
    SUPPLY_REFS.filter(ref =>
        usersQuantity === 1
            ? ref.usersQuantity === 1 || ref.usersQuantity === 0
            : ref.usersQuantity === usersQuantity,
    );
