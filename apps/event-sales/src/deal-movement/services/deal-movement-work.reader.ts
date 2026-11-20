import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { dealMovementStatusQuoted } from '@lib/portal-lib/store/app-settings';
import type { DealMovementWork } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_WORK } from '../constants/deal-movement.const';
import { dealMovementWorkOf } from '../lib/deal-movement-work';

/** Метод списка дел Битрикса (REST). */
const ACTIVITY_LIST_METHOD = 'crm.activity.list';

/** Ответ части пачки: результаты команд по ключам. */
type BatchChunk = { result?: Record<string, unknown> };

/** Префикс ключа команды: сделка восстанавливается из ключа. */
const CMD_PREFIX = 'movement_work_';

/** Момент для фильтра Битрикса: ISO без миллисекунд, с поясом. */
const bitrixMoment = (ms: number): string =>
    new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');

/**
 * Работа по сделкам из дел Битрикса (решение 20.11.2026): звонки (в том
 * числе недозвоны), дела и задачи за срок чтения. Только для сделок,
 * которым иначе досталось бы «Без внимания», — у остальных работа уже
 * видна по разобранным звонкам, активности или смене стадии.
 *
 * Команда на сделку: фильтр по ПРИВЯЗКАМ (`BINDINGS`), а не по владельцу —
 * звонок из карточки сделки записан на контакт или компанию и к сделке
 * только привязан (опыт lead-client 17.09.2026). Одна страница свежих
 * (`ID DESC`, до 50 дел) — для «была ли работа и когда последняя» больше
 * не нужно; `start: -1` — без общего счёта. Команды копятся и уходят
 * ОДНИМ инстансом через ограничитель (`callBatchWithConcurrency(1)`),
 * по 50 в пачке. Сбой части пачки — не исключение: такие сделки остаются
 * без работы из дел, в итоге — предупреждение.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 */
export class DealMovementWorkReader {
    constructor(private readonly bitrix: BitrixService) {}

    async load(
        dealIds: readonly number[],
        fromMs: number,
        warnings: string[],
    ): Promise<Map<number, DealMovementWork[]>> {
        const byDeal = new Map<number, DealMovementWork[]>();
        if (dealIds.length === 0) return byDeal;
        for (const dealId of dealIds) {
            this.bitrix.api.addCmdBatch(
                `${CMD_PREFIX}${dealId}`,
                ACTIVITY_LIST_METHOD,
                {
                    filter: {
                        BINDINGS: [
                            {
                                OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL,
                                OWNER_ID: dealId,
                            },
                        ],
                        '>=LAST_UPDATED': bitrixMoment(fromMs),
                    },
                    select: [...DEAL_MOVEMENT_WORK.select],
                    order: { ID: 'DESC' },
                    start: -1,
                },
            );
        }
        const responses = (await this.bitrix.api.callBatchWithConcurrency(
            1,
        )) as BatchChunk[];
        const answered = new Set<number>();
        for (const response of responses) {
            for (const [cmd, rows] of Object.entries(response?.result ?? {})) {
                if (!cmd.startsWith(CMD_PREFIX)) continue;
                const dealId = Number(cmd.slice(CMD_PREFIX.length));
                if (!Number.isInteger(dealId)) continue;
                answered.add(dealId);
                byDeal.set(dealId, dealMovementWorkOf(rows, fromMs));
            }
        }
        const missing = dealIds.filter(dealId => !answered.has(dealId));
        if (missing.length > 0) {
            warnings.push(
                `звонки и дела прочитаны не у всех сделок (не прочитано: ${missing.length}) — у них ${dealMovementStatusQuoted('abandoned')} считалось без дел`,
            );
        }
        return byDeal;
    }
}
