import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { bxFieldId } from '@lib/shared/lib/utils';
import { ILeadClientBitrix, resultOf, Row } from './lead-client.types';

/** Куда привязать дело: тип владельца Битрикса + id. */
export interface IActivityTarget {
    typeId: BitrixOwnerTypeId;
    id: number;
}

/** Максимум привязок у одного дела — ограничение Битрикса. */
const MAX_BINDINGS_PER_ACTIVITY = 100;

/**
 * Дела лида (звонки, письма) — ещё и в сделку, контакт, компанию.
 *
 * Сделка показывает только дела, привязанные к ней самой: звонки контакта в
 * её таймлайне не видны. `crm.activity.binding.add` добавляет делу вторую
 * привязку, у лида дело остаётся (опыт 17.09.2026).
 *
 * Повторная привязка отвечает Битриксом 400, а каждая 400-я уходит
 * телеграм-алертом, поэтому перед записью читаем текущие привязки.
 */
export class LeadActivityBinder {
    constructor(private readonly bitrix: ILeadClientBitrix) {}

    /** Возвращает число добавленных привязок. */
    async bind(
        leadId: number,
        targets: readonly IActivityTarget[],
        limit: number,
    ): Promise<number> {
        if (!targets.length || limit <= 0) return 0;
        let added = 0;
        for (const activityId of await this.leadActivityIds(leadId, limit)) {
            const bound = await this.bindingKeys(activityId);
            for (const target of targets) {
                if (bound.size >= MAX_BINDINGS_PER_ACTIVITY) break;
                const key = `${target.typeId}:${target.id}`;
                if (bound.has(key)) continue;
                await this.bitrix.api.call('crm.activity.binding.add', {
                    activityId,
                    entityTypeId: target.typeId,
                    entityId: target.id,
                });
                bound.add(key);
                added += 1;
            }
        }
        return added;
    }

    /**
     * Последние дела лида — свежие важнее, лимит отрезает старьё.
     *
     * Фильтр по ПРИВЯЗКАМ, а не по владельцу: после `binding.add` Битрикс
     * переставляет владельца дела на новую сущность (проверено 17.09.2026 —
     * дело лида стало делом сделки), и фильтр `OWNER_ID` лида его теряет.
     */
    private async leadActivityIds(
        leadId: number,
        limit: number,
    ): Promise<number[]> {
        const rows = resultOf(
            await this.bitrix.api.call('crm.activity.list', {
                filter: {
                    BINDINGS: [
                        {
                            OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                            OWNER_ID: leadId,
                        },
                    ],
                },
                select: ['ID'],
                order: { ID: 'DESC' },
            }),
        );
        if (!Array.isArray(rows)) return [];
        return (rows as Row[])
            .map(row => bxFieldId(row.ID))
            .filter((id): id is number => id !== null)
            .slice(0, limit);
    }

    private async bindingKeys(activityId: number): Promise<Set<string>> {
        const rows = resultOf(
            await this.bitrix.api.call('crm.activity.binding.list', {
                activityId,
            }),
        );
        const keys = new Set<string>();
        if (!Array.isArray(rows)) return keys;
        for (const row of rows as Row[]) {
            keys.add(`${String(row.entityTypeId)}:${String(row.entityId)}`);
        }
        return keys;
    }
}
