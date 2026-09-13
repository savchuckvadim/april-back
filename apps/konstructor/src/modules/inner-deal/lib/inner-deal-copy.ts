import { BxDocumentDeal } from 'generated/prisma';
import { InnerDealCopySkipReason } from '../dto/inner-deal.dto';

/**
 * Колонки, которые копия не наследует: `id` (свой у копии), `dealId` (в нём весь
 * смысл копирования), `serviceSmartId` (копия — обычный слепок сделки, а не
 * слепок смарта), `created_at`/`updated_at` (их проставит laravel-timestamps).
 */
const OMITTED_COLUMNS: ReadonlySet<keyof BxDocumentDeal> = new Set([
    'id',
    'dealId',
    'serviceSmartId',
    'created_at',
    'updated_at',
]);

/**
 * Данные копии слепка для другой сделки.
 *
 * Копируем строку ЦЕЛИКОМ — в отличие от 18-колоночного whitelist-а
 * `upsertSnapshot`: при восстановлении сделки важны все колонки, включая те,
 * что фронт сейчас не присылает.
 */
export const buildInnerDealCopyData = (
    source: BxDocumentDeal,
    targetDealId: number,
    overrides: InnerDealCopyOverrides = {},
): Partial<BxDocumentDeal> => {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source) as (keyof BxDocumentDeal)[]) {
        if (OMITTED_COLUMNS.has(key)) {
            continue;
        }
        copy[key] = source[key];
    }

    const data: Partial<BxDocumentDeal> = {
        ...(copy as Partial<BxDocumentDeal>),
        dealId: targetDealId,
        serviceSmartId: null,
    };

    // паритет с легаси DealController::copy: копия достаётся новому
    // ответственному и помечается отделом сервиса
    if (overrides.userId !== undefined && overrides.userId !== null) {
        data.userId = overrides.userId;
    }
    if (overrides.department !== undefined && overrides.department !== null) {
        data.department = overrides.department;
    }
    // копия варианта принадлежит СВОЕМУ элементу смарта на новой сделке —
    // иначе в строке остался бы id элемента исходной сделки
    data.smartId = overrides.variantSmartId ?? null;

    return data;
};

/** Что в копии отличается от источника, помимо сделки. */
export interface InnerDealCopyOverrides {
    userId?: number | null;
    department?: string | null;
    /**
     * Элемент смарта «Варианты комплекта» на сделке-получателе. Задан — копия
     * становится вариантом; не задан — обычным слепком сделки.
     */
    variantSmartId?: number | null;
}

/**
 * Откуда берём слепок-источник.
 * - `deal` — из сделки (ручное восстановление через HTTP);
 * - `serviceSmart` — из слепка «предложения на будущий период» (робот
 *   перезаключения знает только id элемента смарта, но не сделку);
 * - `variant` — из конкретного варианта комплекта сделки.
 */
export type InnerDealCopySource =
    | { kind: 'deal'; dealId: number; serviceSmartId: number | null }
    | { kind: 'serviceSmart'; serviceSmartId: number }
    | { kind: 'variant'; dealId: number; variantSmartId: number };

export interface InnerDealCopyParams extends InnerDealCopyOverrides {
    domain: string;
    source: InnerDealCopySource;
    targetDealId: number;
    /** Перезаписать слепок цели, если он уже есть. */
    force?: boolean;
}

export interface InnerDealCopyResult {
    copied: boolean;
    reason: InnerDealCopySkipReason | null;
    deal: BxDocumentDeal | null;
}
