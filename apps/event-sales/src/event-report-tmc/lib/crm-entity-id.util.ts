/**
 * Id сущности CRM из параметра робота или поля РПА.
 *
 * Робот печатает crm-поле как есть: легаси писало в поля РПА голые id
 * (`216773`), Bitrix в привязках умеет и `D_216773` / `CO_95857` / `C_48223`,
 * множественное поле отдаёт массив. Пусто, ноль или мусор — undefined:
 * «не передано», а не «передан ноль».
 */
export const parseCrmEntityId = (raw: unknown): number | undefined => {
    const value: unknown = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
    }
    const digits = String(value)
        .trim()
        .replace(/^[A-Za-z]+_/, '');
    if (!/^\d+$/.test(digits)) return undefined;
    const id = Number(digits);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};
