import { Injectable } from '@nestjs/common';
import { SupplyTextService } from '@lib/garant';
import { SupplyDto } from '../../dto/supply.dto';
import { DocumentVariantDto } from '../dto/document-variant/document-variant.dto';
import { ProductRowDto } from '../dto/product-row/product-row.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '../dto/product-row-set/product-row-set.dto';
import { ProductTypeEnum } from '../dto/product/product.dto';

/**
 * Поставки, уже дополненные в рамках одного документа. Ключ — поставка
 * целиком в JSON: одинаковая поставка читается из справочника один раз,
 * сколько бы строк, наборов и вариантов её ни несли. Память живёт ровно один
 * запрос генерации: правка справочника подхватывается со следующего КП.
 */
export type SupplyEnrichMemo = Map<string, SupplyDto>;

/** Наборы строк документа: основной и «для сравнения». */
export interface ProductRowSetsPayload {
    general?: ProductRowSetDto[] | null;
    alternative?: ProductRowSetDto[] | null;
}

/** Части документа, которые несут подписи поставок. */
export interface SupplyCaptionPayload {
    supply?: SupplyDto | null;
    rows?: ProductRowDto[] | null;
    total?: ProductRowDto | null;
    sets?: ProductRowSetsPayload | null;
}

/** Запрос, у которого подписи несут и верхние поля, и каждый вариант комплекта. */
export interface SupplyCaptionVariantsPayload extends SupplyCaptionPayload {
    variants?: DocumentVariantDto[] | null;
}

/** Типы продукта, под которыми набор хранит строки. */
const SET_ROW_KEYS: readonly ProductTypeEnum[] = Object.values(ProductTypeEnum);

/**
 * Дополняет поставки в payload генерации текстами с бэка (решение 2).
 * Легаси-фронт присылает тексты сам — они сильнее; новый фронт шлёт code,
 * и пустые поля заполняются из шаблонов `supplies` по числу ОД.
 *
 * Обращения к справочнику идут последовательно и через память документа
 * (`SupplyEnrichMemo`): число запросов равно числу разных поставок,
 * сколько бы строк их ни несло.
 */
@Injectable()
export class SupplyPayloadEnricherService {
    constructor(private readonly supplyTexts: SupplyTextService) {}

    async enrichSupply(
        supply: SupplyDto,
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<SupplyDto> {
        const key = JSON.stringify(supply);
        const known = memo.get(key);
        if (known) return { ...known };

        const enriched = await this.supplyTexts.enrich(supply);
        memo.set(key, { ...enriched });
        return { ...enriched };
    }

    /** Строки документа: currentSupply строки, поставка товара и подпись КП. */
    async enrichRows(
        rows: ProductRowDto[],
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<ProductRowDto[]> {
        const result: ProductRowDto[] = [];
        for (const row of rows) {
            result.push(row ? await this.enrichRow(row, memo) : row);
        }
        return result;
    }

    async enrichRow(
        row: ProductRowDto,
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<ProductRowDto> {
        const currentSupply = row.currentSupply
            ? await this.enrichSupply(row.currentSupply, memo)
            : row.currentSupply;
        const productSupply = row.product?.supply
            ? await this.enrichSupply(row.product.supply, memo)
            : row.product?.supply;
        const quantityForKp =
            row.product?.quantityForKp ||
            (productSupply && productSupply.quantityForKp) ||
            currentSupply?.quantityForKp ||
            '';
        const supply =
            row.supply && !row.supply.forkp && quantityForKp
                ? { ...row.supply, forkp: quantityForKp }
                : row.supply;
        return {
            ...row,
            currentSupply,
            supply,
            product: row.product
                ? {
                      ...row.product,
                      supply: productSupply ?? row.product.supply,
                      quantityForKp,
                  }
                : row.product,
        };
    }

    /**
     * Наборы документа: строки по всем типам продукта и итоговые строки
     * каждого набора, основного и «для сравнения». Из этих строк счёт и
     * страницы сравнения берут подписи поставок. Отсутствующий набор, тип
     * или строка остаются как пришли.
     */
    async enrichSets<T extends ProductRowSetsPayload | null | undefined>(
        sets: T,
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<T> {
        if (!sets) return sets;
        return {
            ...sets,
            general: await this.enrichSetList(sets.general, memo),
            alternative: await this.enrichSetList(sets.alternative, memo),
        };
    }

    /**
     * Подписи поставок во всех частях документа сразу: поставка, строки,
     * итог и наборы. Общая точка для КП, превью и вариантов комплекта.
     */
    async enrichPayload<T extends SupplyCaptionPayload>(
        payload: T,
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<T> {
        return {
            ...payload,
            supply: payload.supply
                ? await this.enrichSupply(payload.supply, memo)
                : payload.supply,
            rows: payload.rows
                ? await this.enrichRows(payload.rows, memo)
                : payload.rows,
            total: payload.total
                ? await this.enrichRow(payload.total, memo)
                : payload.total,
            sets: await this.enrichSets(payload.sets, memo),
        };
    }

    /**
     * Подписи в запросе с вариантами комплекта: верхние поля печатаются, когда
     * вариантов нет или он один, а каждый вариант печатается сам, поэтому
     * дополняются и они. Одна память на запрос держит число обращений к
     * справочнику равным числу разных поставок. Запрос без `variants` остаётся
     * без `variants`, пустой список остаётся пустым.
     */
    async enrichWithVariants<T extends SupplyCaptionVariantsPayload>(
        payload: T,
        memo: SupplyEnrichMemo = new Map(),
    ): Promise<T> {
        const top = await this.enrichPayload(payload, memo);
        if (!payload.variants) return top;

        const variants: DocumentVariantDto[] = [];
        for (const variant of payload.variants) {
            variants.push(await this.enrichPayload(variant, memo));
        }
        return { ...top, variants };
    }

    private async enrichSetList(
        list: ProductRowSetDto[] | null | undefined,
        memo: SupplyEnrichMemo,
    ): Promise<ProductRowSetDto[] | null | undefined> {
        if (!Array.isArray(list)) return list;
        const result: ProductRowSetDto[] = [];
        for (const set of list) {
            result.push(set ? await this.enrichSet(set, memo) : set);
        }
        return result;
    }

    private async enrichSet(
        set: ProductRowSetDto,
        memo: SupplyEnrichMemo,
    ): Promise<ProductRowSetDto> {
        return {
            ...set,
            rows: set.rows
                ? await this.enrichSetRows(set.rows, memo)
                : set.rows,
            total: Array.isArray(set.total)
                ? await this.enrichRows(set.total, memo)
                : set.total,
        };
    }

    private async enrichSetRows(
        rows: ProductRowSetItemDto,
        memo: SupplyEnrichMemo,
    ): Promise<ProductRowSetItemDto> {
        const result: ProductRowSetItemDto = { ...rows };
        for (const key of SET_ROW_KEYS) {
            const list = rows[key];
            if (Array.isArray(list)) {
                result[key] = await this.enrichRows(list, memo);
            }
        }
        return result;
    }
}
