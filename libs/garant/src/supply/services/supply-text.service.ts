import { Injectable } from '@nestjs/common';
import { SupplyService } from './api/supply.service';
import { SupplyEntity } from '../supply.entity';
import {
    isNumberedSupplyCode,
    parseCustomSupplyCode,
    type SupplyKind,
} from '../lib/custom-supply-code.util';
import {
    renderSupplyTexts,
    SUPPLY_TEXT_FIELDS,
    type SupplyTextField,
    type SupplyTexts,
} from '../lib/supply-template.util';

/** Тексты поставки, отрендеренные под конкретное число ОД. */
export interface ResolvedSupplyTexts extends SupplyTexts {
    code: string;
    type: string;
    usersQuantity: number;
    coefficient: number;
    name: string;
    /** Справочная поставка, из шаблонов которой собраны тексты (для X-ОД — ближайшая). */
    sourceCode: string;
}

/** Минимум, по которому payload генерации опознаёт поставку. */
export interface SupplyTextsPayload extends Partial<Record<SupplyTextField, unknown>> {
    code?: string | null;
    type?: string | null;
    usersQuantity?: number | null;
}

const isBlank = (value: unknown): boolean =>
    value === null || value === undefined || value === false || value === '';

/**
 * Тексты договоров и КП по коду поставки (решение владельца 2: источник —
 * бэк, шаблоны с числом прописью). Легаси-payload с готовыми текстами
 * проходит без изменений: заполняются только пустые поля.
 */
@Injectable()
export class SupplyTextService {
    constructor(private readonly supplyService: SupplyService) {}

    async resolve(
        code: string,
        usersQuantity?: number | null,
    ): Promise<ResolvedSupplyTexts | null> {
        const custom = parseCustomSupplyCode(code);
        const source = custom
            ? await this.findReference(custom.type, custom.usersQuantity)
            : await this.supplyService.findByCode(code);
        if (!source) return null;

        const quantity = custom?.usersQuantity ?? usersQuantity ?? source.usersQuantity;
        return {
            ...renderSupplyTexts(source, quantity),
            code,
            type: source.type,
            usersQuantity: quantity,
            coefficient: source.coefficient,
            name: custom ? this.customName(source, quantity) : source.name,
            sourceCode: source.code,
        };
    }

    /**
     * Дополняет payload недостающими текстами. Что пришло с фронта — сильнее
     * (совместимость со старым конструктором); без `code` дополнять нечем.
     */
    async enrich<T extends SupplyTextsPayload>(payload: T): Promise<T> {
        if (!payload.code) return payload;
        const missing = SUPPLY_TEXT_FIELDS.filter(field => isBlank(payload[field]));
        if (!missing.length) return payload;

        const resolved = await this.resolve(payload.code, payload.usersQuantity);
        if (!resolved) return payload;

        const patch: Partial<Record<SupplyTextField, string>> = {};
        for (const field of missing) {
            const value = resolved[field];
            if (value !== null) patch[field] = value;
        }
        return { ...payload, ...patch };
    }

    /**
     * Справочная поставка для X-ОД: того же типа, с числом ОД в коде и
     * заполненным contractName; ближайшая снизу, иначе ближайшая сверху.
     */
    private async findReference(
        type: SupplyKind,
        usersQuantity: number,
    ): Promise<SupplyEntity | null> {
        const candidates = ((await this.supplyService.findMany()) ?? [])
            .filter(
                supply =>
                    supply.type === type &&
                    isNumberedSupplyCode(supply.code, type) &&
                    supply.contractName !== null,
            )
            .sort((a, b) => a.usersQuantity - b.usersQuantity);
        if (!candidates.length) return null;
        const below = candidates.filter(supply => supply.usersQuantity <= usersQuantity);
        return below[below.length - 1] ?? candidates[0] ?? null;
    }

    /** «Интернет 7 ОД» — по образцу справочного имени с заменой числа. */
    private customName(source: SupplyEntity, quantity: number): string {
        const replaced = source.name.replace(/\d+/, String(quantity));
        return replaced === source.name ? `${source.name} ${quantity} ОД` : replaced;
    }
}
