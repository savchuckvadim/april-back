import { bxFieldId, bxFieldText } from '@lib/shared/lib/utils';
import {
    communicationKey,
    ILeadClientBitrix,
    LeadClientKind,
    multiItems,
    resultOf,
    Row,
} from './lead-client.types';

const COMMUNICATION_FIELDS = ['PHONE', 'EMAIL'] as const;

/** crm.duplicate.findbycomm принимает не больше 20 значений за вызов. */
const FIND_BY_COMM_LIMIT = 20;

/**
 * Существующий клиент по телефону/почте лида (решение владельца
 * 28.09.2026: заявки автоматом создают контакт, и повторная заявка того же
 * человека не должна давать второй).
 *
 * Отдельно от фабрики: у поиска своя политика (только однозначное
 * совпадение, сбой — как раньше) и своя уборка задвоенных телефонов после
 * привязки. НЕ @Injectable: bitrix привязан к домену.
 */
export class LeadClientCommMatcher {
    constructor(private readonly bitrix: ILeadClientBitrix) {}

    /**
     * Существующий клиент по телефону/почте лида — ТОЛЬКО однозначный:
     * ровно один контакт (или компания) на все значения. Несколько — не
     * гадаем, создаём как раньше и предупреждаем. Сбой поиска — тоже как
     * раньше: дубль лучше, чем несозданный клиент.
     */
    async find(
        type: 'CONTACT' | 'COMPANY',
        lead: Row,
        warnings: string[],
    ): Promise<number | null> {
        const ids = new Set<number>();
        for (const field of COMMUNICATION_FIELDS) {
            const values = multiItems(lead[field])
                .map(item => item.VALUE)
                .slice(0, FIND_BY_COMM_LIMIT);
            if (!values.length) continue;
            try {
                const found = resultOf(
                    await this.bitrix.api.call('crm.duplicate.findbycomm', {
                        type: field,
                        values,
                        entity_type: type,
                    }),
                ) as Row | undefined;
                const list = found?.[type];
                if (Array.isArray(list)) {
                    for (const raw of list) {
                        const id = bxFieldId(raw);
                        if (id) ids.add(id);
                    }
                }
            } catch {
                return null;
            }
        }
        if (ids.size === 1) return [...ids][0];
        if (ids.size > 1) {
            warnings.push(
                `Лид ${String(lead.ID)}: по телефону/почте найдено несколько клиентов (${[...ids].join(', ')}) — создан новый, проверьте дубли`,
            );
        }
        return null;
    }

    /**
     * Задвоенные телефоны/почты клиента после привязки к лиду.
     *
     * Битрикс сам копирует контактные данные лида в клиента при привязке
     * (опыт 17.09.2026): у найденного по телефону клиента этот номер уже
     * есть, и копия дала бы второй такой же. Лишние записи снимаем через
     * {ID, DELETE: 'Y'}; остаётся первая по порядку.
     */
    async dedupe(kind: LeadClientKind, clientId: number): Promise<void> {
        const client = resultOf(
            await this.bitrix.api.call(`crm.${kind}.get`, { id: clientId }),
        ) as Row | undefined;
        const fields: Row = {};
        for (const field of COMMUNICATION_FIELDS) {
            const raw = client?.[field];
            if (!Array.isArray(raw)) continue;
            const seen = new Set<string>();
            const drop: Row[] = [];
            for (const item of raw) {
                if (!item || typeof item !== 'object') continue;
                const value = bxFieldText((item as Row).VALUE);
                const itemId = bxFieldId((item as Row).ID);
                if (!value || !itemId) continue;
                const key = communicationKey(value);
                if (seen.has(key)) {
                    drop.push({ ID: String(itemId), DELETE: 'Y' });
                } else {
                    seen.add(key);
                }
            }
            if (drop.length) fields[field] = drop;
        }
        if (Object.keys(fields).length) {
            await this.bitrix.api.call(`crm.${kind}.update`, {
                id: clientId,
                fields,
            });
        }
    }
}
