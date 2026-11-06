import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';

/** Сколько id уходит в один `crm.lead.list` — страница ответа Битрикса. */
const LEAD_LIST_PAGE = 50;

/**
 * Какие из лидов уже удалены (или в корзине).
 *
 * Задача, у которой в `UF_CRM_TASK` есть удалённый лид, создаётся, но
 * Битрикс не заводит для неё дело: в карточке сделки задачи не видно, хотя
 * у сотрудника она есть (garant 06.11.2026, сделка 33467 — лид 215557
 * удалили 08.10, а сделка продолжала на него ссылаться).
 *
 * Не @Injectable: создаётся через `new` с битриксом текущего портала.
 */
export class LiveLeadsReader {
    private readonly logger = new Logger(LiveLeadsReader.name);

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Id из списка, которых на портале нет. Ошибка чтения — пустой набор:
     * лучше прежнее поведение (задача не видна в сделке), чем потерянная
     * привязка живой заявки.
     */
    async findMissing(ids: readonly number[]): Promise<Set<number>> {
        const wanted = [...new Set(ids.filter(id => id > 0))];
        if (!wanted.length) return new Set();

        const alive = new Set<number>();
        try {
            for (let i = 0; i < wanted.length; i += LEAD_LIST_PAGE) {
                const page = wanted.slice(i, i + LEAD_LIST_PAGE);
                const response = await this.bitrix.lead.getList(
                    { ID: page } as never,
                    ['ID'],
                );
                const rows = Array.isArray(response?.result)
                    ? response.result
                    : [];
                for (const row of rows) alive.add(Number(row.ID));
            }
        } catch (error) {
            this.logger.warn(
                `лиды ${wanted.join(', ')} не проверены — привязки задачи ` +
                    `оставлены как есть (${(error as Error).message})`,
            );
            return new Set();
        }

        return new Set(wanted.filter(id => !alive.has(id)));
    }
}
