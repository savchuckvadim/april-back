import {
    ComplectDto,
    ComplectInfoblockValueDto,
} from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';

export interface MergedDocumentVariant {
    variant: DocumentVariantDto;
    /** Что не сошлось при слиянии — в лог и, при желании, в ответ. */
    warnings: string[];
}

const round2 = (value: number): number => Number(value.toFixed(2));

/** Ключ инфоблока внутри группы: код, а без кода — имя. */
const infoblockKey = (value: ComplectInfoblockValueDto): string =>
    value.code || value.name;

/**
 * Объединение наполнений: группы по имени и типу, внутри группы инфоблоки по
 * коду. Порядок — первого появления: так «единый порядок» совпадает с
 * порядком каталога у первого набора, а повторы схлопываются.
 */
export const mergeComplects = (
    complects: readonly ComplectDto[][],
): ComplectDto[] => {
    const groups = new Map<string, ComplectDto>();

    for (const complect of complects) {
        for (const group of complect) {
            const groupKey = `${group.type}:${group.groupsName}`;
            const existing = groups.get(groupKey);
            if (!existing) {
                groups.set(groupKey, { ...group, value: [...group.value] });
                continue;
            }
            for (const value of group.value) {
                const key = infoblockKey(value);
                const found = existing.value.find(
                    item => infoblockKey(item) === key,
                );
                if (!found) {
                    existing.value.push({ ...value });
                    continue;
                }
                // инфоблок выбран хотя бы в одном наборе — выбран в общем
                found.checked = found.checked || value.checked;
            }
        }
    }

    return [...groups.values()];
};

/**
 * Общий итог нескольких наборов.
 *
 * Суммы складываются. Скидка пересчитывается от сумм: коэффициент цены
 * общего итога = Σ сумм со скидкой / Σ сумм без скидки, иначе итог «со
 * скидкой 20%» получился бы у наборов с разными скидками. Срок (quantity —
 * месяцы) складывать нельзя: один договор — один срок; расхождение уходит в
 * warnings, берётся первый.
 */
export const mergeTotals = (
    totals: readonly ProductRowDto[],
): { total: ProductRowDto; warnings: string[] } => {
    const [first, ...rest] = totals;
    if (!first) {
        throw new Error('mergeTotals: нет итогов');
    }
    if (!rest.length) {
        return { total: first, warnings: [] };
    }

    const warnings: string[] = [];
    let sum = 0;
    let current = 0;
    let base = 0;
    let month = 0;
    let discountAmount = 0;
    let baseSum = 0;

    for (const total of totals) {
        const price = total.price;
        sum += price.sum;
        current += price.current;
        base += price.default;
        month += price.month;
        discountAmount += price.discount?.amount ?? 0;
        const precent = price.discount?.precent ?? 1;
        baseSum +=
            precent > 0 && precent <= 1 ? price.sum / precent : price.sum;

        if (price.quantity !== first.price.quantity) {
            warnings.push(
                `срок набора «${total.name}» (${price.quantity}) отличается от первого (${first.price.quantity}) — взят первый`,
            );
        }
    }

    const precent = baseSum > 0 ? round2(sum / baseSum) : 1;

    return {
        total: {
            ...first,
            price: {
                ...first.price,
                sum: round2(sum),
                current: round2(current),
                default: round2(base),
                month: round2(month),
                discount: {
                    ...first.price.discount,
                    precent: precent > 1 ? 1 : precent,
                    amount: round2(discountAmount),
                },
            },
        },
        warnings,
    };
};

/**
 * Несколько участников → один: наполнение объединено, строки подряд по
 * наборам, итог общий. Договор, ОД и тип договора — первого участника: в
 * этом режиме они у всех одинаковые (один договор), проверка на фронте.
 */
export const mergeDocumentVariants = (
    variants: readonly DocumentVariantDto[],
): MergedDocumentVariant => {
    const [first] = variants;
    if (!first) {
        throw new Error('mergeDocumentVariants: нет участников');
    }
    if (variants.length === 1) {
        return { variant: first, warnings: [] };
    }

    const { total, warnings } = mergeTotals(variants.map(item => item.total));

    return {
        variant: {
            ...first,
            variantSmartId: null,
            title: variants
                .map(item => item.title)
                .filter(Boolean)
                .join(' + '),
            complect: mergeComplects(variants.map(item => item.complect)),
            rows: variants.flatMap(item => item.rows),
            sets: {
                general: variants.flatMap(item => item.sets.general),
                alternative: variants.flatMap(item => item.sets.alternative),
            },
            total,
        },
        warnings,
    };
};
