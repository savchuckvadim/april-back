import type { offer_zakupki_settings } from 'generated/prisma';

/**
 * Форма настроек «3 КП для торгов» — порт Laravel
 * `OfferZakupkiSettingsController::createSettingsForm`: два вымышленных
 * поставщика по 9 полям. Коды полей (`provider1_shortname`, …) — контракт с
 * генерацией КП (`zakupki-offer`, `OtherProvidersDto`), менять нельзя.
 */
export type ZakupkiProviderKey = 'provider1' | 'provider2';
export type ZakupkiFieldType = 'string' | 'text';

export interface ZakupkiFieldSpec {
    /** Хвост кода без префикса provider1_/provider2_ — он же колонка-суффикс */
    suffix:
        | 'shortname'
        | 'address'
        | 'inn'
        | 'phone'
        | 'email'
        | 'director'
        | 'position'
        | 'letter_text'
        | 'price_coefficient';
    name: string;
    placeholder: string;
    type: ZakupkiFieldType;
    isRequired: boolean;
}

export const ZAKUPKI_FIELD_SPECS: readonly ZakupkiFieldSpec[] = [
    {
        suffix: 'shortname',
        name: 'Сокращенное наименование',
        placeholder: 'ООО Пирожок',
        type: 'string',
        isRequired: true,
    },
    {
        suffix: 'address',
        name: 'Адрес',
        placeholder: '35734, г.Лермонтов...',
        type: 'text',
        isRequired: true,
    },
    {
        suffix: 'inn',
        name: 'ИНН',
        placeholder: '12345...',
        type: 'string',
        isRequired: false,
    },
    {
        suffix: 'phone',
        name: 'Телефон',
        placeholder: '+7(962)0027991',
        type: 'string',
        isRequired: false,
    },
    {
        suffix: 'email',
        name: 'Email',
        placeholder: 'april-app@mail.ru',
        type: 'string',
        isRequired: false,
    },
    {
        suffix: 'director',
        name: 'Имя руководителя организации',
        placeholder: 'Иванов А.А.',
        type: 'string',
        isRequired: true,
    },
    {
        suffix: 'position',
        name: 'Должность руководителя организации',
        placeholder: 'Директор',
        type: 'string',
        isRequired: true,
    },
    {
        suffix: 'letter_text',
        name: 'Текст сопроводительного письма',
        placeholder:
            'Текст сопроводительного письма. Используйте {{period}} - для отображения даты действия договора и {{product_name}} для отображения названия комплекта в тексте письма',
        type: 'text',
        isRequired: false,
    },
    {
        suffix: 'price_coefficient',
        name: 'Разница в цене',
        placeholder: '',
        type: 'string',
        isRequired: false,
    },
];

export const ZAKUPKI_PROVIDER_KEYS: readonly ZakupkiProviderKey[] = [
    'provider1',
    'provider2',
];

export interface ZakupkiFormField {
    id: number;
    name: string;
    placeholder: string;
    code: string;
    value: string | null;
    type: ZakupkiFieldType;
    isRequired: boolean;
}

export type ZakupkiProvidersForm = Record<
    ZakupkiProviderKey,
    ZakupkiFormField[]
>;

export const zakupkiFieldCode = (
    provider: ZakupkiProviderKey,
    suffix: ZakupkiFieldSpec['suffix'],
): string => `${provider}_${suffix}`;

/** Все допустимые коды полей — остальное при сохранении отбрасывается. */
export const ZAKUPKI_FIELD_CODES: readonly string[] =
    ZAKUPKI_PROVIDER_KEYS.flatMap(provider =>
        ZAKUPKI_FIELD_SPECS.map(spec =>
            zakupkiFieldCode(provider, spec.suffix),
        ),
    );

export type ZakupkiFieldCode =
    `${ZakupkiProviderKey}_${ZakupkiFieldSpec['suffix']}`;

/** Колонки записи, которые правит форма: коэффициент — число, остальное — строка или null. */
export type ZakupkiColumns = {
    [K in ZakupkiFieldCode]?: K extends `${string}_price_coefficient`
        ? number
        : string | null;
};

const columnValue = (
    record: Partial<offer_zakupki_settings>,
    code: string,
): string | null => {
    const value = (record as Record<string, unknown>)[code];
    if (value === null || value === undefined) return null;
    return String(value);
};

/** Форма двух поставщиков из записи таблицы (значения — строками, как ждёт фронт и генерация). */
export const buildZakupkiProvidersForm = (
    record: Partial<offer_zakupki_settings>,
): ZakupkiProvidersForm => {
    const form = {} as ZakupkiProvidersForm;
    for (const provider of ZAKUPKI_PROVIDER_KEYS) {
        form[provider] = ZAKUPKI_FIELD_SPECS.map((spec, index) => ({
            id: index + 1,
            name: spec.name,
            placeholder: spec.placeholder,
            code: zakupkiFieldCode(provider, spec.suffix),
            value: columnValue(record, zakupkiFieldCode(provider, spec.suffix)),
            type: spec.type,
            isRequired: spec.isRequired,
        }));
    }
    return form;
};

/**
 * Значения формы → колонки записи. Коэффициент цены — число (дефолты 1.05 /
 * 1.10 остаются, если прислали пусто или не число); неизвестные коды
 * игнорируются.
 */
export const zakupkiValuesToColumns = (
    values: ReadonlyArray<{ code: string; value: string | null }>,
): ZakupkiColumns => {
    const result: Record<string, string | number | null> = {};
    for (const { code, value } of values) {
        if (!ZAKUPKI_FIELD_CODES.includes(code)) continue;
        if (code.endsWith('_price_coefficient')) {
            const parsed = Number(String(value ?? '').replace(',', '.'));
            if (Number.isFinite(parsed) && parsed > 0) result[code] = parsed;
            continue;
        }
        result[code] = value === null ? null : String(value);
    }
    // ключи сужены проверкой по ZAKUPKI_FIELD_CODES, типы значений — по хвосту кода
    return result as ZakupkiColumns;
};

export const DEFAULT_LETTER_TEXT = {
    provider1:
        'Имеем честь предложить заключить контракт на период {{period}} на следующий комплект: ',
    provider2:
        'Имеем честь предложить заключить контракт на период с  {{period}}  года на следующий комплект: ',
} as const;
