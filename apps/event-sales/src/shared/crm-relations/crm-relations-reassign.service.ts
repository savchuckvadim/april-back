import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBatchGroupBuffer } from '../batch/batch-group-buffer.interface';

type BxRow = Record<string, unknown>;

/** Поверхностные связи клиента, от которых собираются контакты. */
export interface ICrmRelationsScope {
    dealIds: number[];
    leadIds: number[];
    companyIds: number[];
}

/** Префикс ключей чтения: ответ разбираем только по своим командам. */
const READ_PREFIX = 'crm_rel_ct';

/** crm.lead.list отдаёт не больше 50 строк — фильтр по ID режем так же. */
const LEAD_LIST_PAGE = 50;

/**
 * Смена ответственного на контактах клиента — ТОЛЬКО поверхностные связи:
 * сделка → контакт, лид → контакт, компания → контакт. Контакты контактов
 * и прочая рекурсия сюда не входят сознательно.
 *
 * Две фазы, как у всех хуков продаж (ai/rules/bitrix-batch-grouping.md):
 *  - {@link collectContactIds} — чтение одним batch-проводом. `bitrix.api`
 *    держит одну карту команд, и отправка уносит её целиком: звать метод
 *    можно только тогда, когда в инстансе нет чужих накопленных команд
 *    (фаза чтения, до создания буфера);
 *  - {@link queueContactsResponsible} — запись через буфер вызывающего.
 *    Команды независимы (ссылок `$result` нет), группы закрывает сам
 *    вызывающий — не больше 50 команд в одной группе.
 *
 * Контакты вторичны: сбой чтения пишется в лог и даёт пустой список, но не
 * роняет основную работу.
 *
 * Не injectable: bitrix привязан к домену и приходит снаружи.
 */
export class CrmRelationsReassignService {
    private readonly logger = new Logger(CrmRelationsReassignService.name);

    constructor(private readonly bitrix: BitrixService) {}

    /**
     * Фаза чтения: id контактов сделок, лидов (CONTACT_ID + contact.items) и
     * компаний — одним batch-проводом, без дублей. Пустой охват — ни одного
     * вызова.
     */
    async collectContactIds(scope: ICrmRelationsScope): Promise<number[]> {
        const dealIds = uniqueIds(scope.dealIds);
        const leadIds = uniqueIds(scope.leadIds);
        const companyIds = uniqueIds(scope.companyIds);
        if (!dealIds.length && !leadIds.length && !companyIds.length) {
            return [];
        }

        for (const id of dealIds) {
            this.bitrix.batch.deal.contactItemsGet(
                `${READ_PREFIX}_deal_${id}`,
                id,
            );
        }
        for (const id of leadIds) {
            this.bitrix.batch.lead.contactItemsGet(
                `${READ_PREFIX}_lead_${id}`,
                id,
            );
        }
        // Главный контакт лида живёт ещё и в штатном CONTACT_ID.
        for (let i = 0; i < leadIds.length; i += LEAD_LIST_PAGE) {
            this.bitrix.batch.lead.getList(
                `${READ_PREFIX}_leads_${i}`,
                { ID: leadIds.slice(i, i + LEAD_LIST_PAGE) } as never,
                ['ID', 'CONTACT_ID'],
            );
        }
        for (const id of companyIds) {
            this.bitrix.batch.company.contactItemsGet(
                `${READ_PREFIX}_company_${id}`,
                id,
            );
        }

        try {
            const responses = await this.bitrix.api.callBatchWithConcurrency(1);
            const ids = new Set<number>();
            for (const chunk of responses) {
                const result = (chunk?.result ?? {}) as Record<string, unknown>;
                for (const [key, value] of Object.entries(result)) {
                    if (!key.startsWith(READ_PREFIX)) continue;
                    for (const row of rowsOf(value)) {
                        const id = toId(row.CONTACT_ID);
                        if (id) ids.add(id);
                    }
                }
            }
            return [...ids];
        } catch (error) {
            this.logger.warn(
                `[contacts] чтение контактов не удалось — ответственный на контактах не сменится: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return [];
        }
    }

    /**
     * Фаза записи: `contact.update {ASSIGNED_BY_ID}` в текущую группу
     * буфера. Ключ — `<keyPrefix>_contact_<id>`, уникален на контакт.
     */
    queueContactsResponsible(
        buffer: Pick<IBatchGroupBuffer, 'queue'>,
        contactIds: number[],
        responsibleId: number,
        keyPrefix: string,
    ): void {
        if (!toId(responsibleId)) return;
        for (const id of uniqueIds(contactIds)) {
            buffer.queue(() =>
                this.bitrix.batch.contact.update(
                    `${keyPrefix}_contact_${id}`,
                    id,
                    { ASSIGNED_BY_ID: String(responsibleId) },
                ),
            );
        }
    }
}

const toId = (raw: unknown): number | null => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const uniqueIds = (ids: readonly unknown[]): number[] => [
    ...new Set(ids.map(toId).filter((id): id is number => id !== null)),
];

const rowsOf = (value: unknown): BxRow[] => {
    if (Array.isArray(value)) {
        return value.filter(
            (row): row is BxRow => !!row && typeof row === 'object',
        );
    }
    return value && typeof value === 'object' ? [value as BxRow] : [];
};
