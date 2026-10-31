/** Тройка цен региона: рабс, налог, рабс с налогом */
export interface RegionPrice {
    abs: number;
    tax: number;
    tax_abs: number;
}

/** Свои настройки портала на регион, влияющие на цену */
export interface PortalPriceOverride {
    ownAbs: number | null;
    ownTax: number | null;
    ownTaxAbs: number | null;
    /** Регион-источник: его цены берутся целиком */
    ownAbsRegion: RegionPrice | null;
}

/** Ноль в own-полях считается «не задано»: старые сбросы писали 0.00 */
const isSet = (value: number | null | undefined): value is number =>
    typeof value === 'number' && value > 0;

/**
 * Действующая цена региона для портала.
 * Приоритет: регион-источник → ручной рабс → общий рабс региона.
 * Ручные поля подставляются каждое по отдельности, как и раньше:
 * задан только own_abs — налог и рабс с налогом остаются общими.
 */
export const resolvePortalPrice = (
    region: RegionPrice,
    override?: PortalPriceOverride | null,
): RegionPrice => {
    if (!override) {
        return { abs: region.abs, tax: region.tax, tax_abs: region.tax_abs };
    }
    const source = override.ownAbsRegion;
    if (source) {
        return { abs: source.abs, tax: source.tax, tax_abs: source.tax_abs };
    }
    return {
        abs: isSet(override.ownAbs) ? override.ownAbs : region.abs,
        tax: isSet(override.ownTax) ? override.ownTax : region.tax,
        tax_abs: isSet(override.ownTaxAbs)
            ? override.ownTaxAbs
            : region.tax_abs,
    };
};
