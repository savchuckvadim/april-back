import { PortalRegionOwnPatch, roundToCents } from '@lib/garant';

/** Что просят поставить региону портала: ручной рабс или регион-источник */
export interface OwnPriceInput {
    /** Ручной рабс; null — сбросить */
    ownAbs: string | null;
    /** Регион-источник; null — сбросить */
    ownAbsRegionId: number | null;
}

export type OwnPricePatchResult =
    | { ok: true; patch: PortalRegionOwnPatch }
    | { ok: false; reason: string };

const RESET_PATCH: PortalRegionOwnPatch = {
    own_abs: null,
    own_tax: null,
    own_tax_abs: null,
    own_abs_region_id: null,
};

/**
 * Правка own-полей по запросу из интерфейса.
 * Ручной рабс и регион-источник взаимоисключающие: задание одного
 * сбрасывает другое. Оба null — возврат к общему рабсу региона.
 * Источник должен существовать и не совпадать с самим регионом.
 *
 * Для ручного рабса пишутся и производные own_tax (коэффициент НДС рабса
 * из настроек вендора, параметр vat) и own_tax_abs (рабс × vat). Выдача
 * цен их не читает и считает НДС на лету, а записанные значения держат
 * таблицу портала согласованной для всего, что читает её напрямую.
 */
export const buildOwnPricePatch = (
    regionId: number,
    input: OwnPriceInput,
    knownRegionIds: Set<number>,
    vat: number,
): OwnPricePatchResult => {
    const hasAbs = input.ownAbs !== null;
    const hasSource = input.ownAbsRegionId !== null;

    if (hasAbs && hasSource) {
        return {
            ok: false,
            reason: 'укажите либо свой рабс, либо регион-источник',
        };
    }
    if (hasSource) {
        const sourceId = input.ownAbsRegionId as number;
        if (sourceId === regionId) {
            return {
                ok: false,
                reason: 'регион не может быть источником сам для себя',
            };
        }
        if (!knownRegionIds.has(sourceId)) {
            return { ok: false, reason: 'регион-источник не найден' };
        }
        return {
            ok: true,
            patch: { ...RESET_PATCH, own_abs_region_id: sourceId },
        };
    }
    if (hasAbs) {
        const abs = Number(input.ownAbs);
        if (!Number.isFinite(abs) || abs <= 0) {
            return { ok: false, reason: 'свой рабс должен быть больше нуля' };
        }
        return {
            ok: true,
            patch: {
                own_abs: abs.toFixed(2),
                own_tax: vat.toFixed(2),
                own_tax_abs: roundToCents(abs * vat).toFixed(2),
                own_abs_region_id: null,
            },
        };
    }
    return { ok: true, patch: { ...RESET_PATCH } };
};
