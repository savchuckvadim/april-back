import { BitrixService } from '@/modules/bitrix';
import { IBatchGroupBuffer } from '../../../../shared/batch/batch-group-buffer.interface';

/**
 * Сколько контактов лида привязывать к существующей сделке в группе лида:
 * у лида их обычно 1–2, а вся группа (сделка, лид, контакты, задача, дела,
 * KPI) обязана влезть в один batch из 50 команд.
 */
export const MAX_DEAL_CONTACT_LINKS = 5;

/**
 * Контакты лида → СУЩЕСТВУЮЩАЯ сделка, не перезаписывая её набор: по
 * команде `crm.deal.contact.add` на контакт, в ту же группу буфера, что и
 * обновление сделки. Уже привязанный контакт метод не дублирует (ответ
 * false без ошибки).
 *
 * Почему не CONTACT_IDS в deal.update: ни crm.deal.list, ни crm.deal.get
 * это поле не отдают (проверено на портале 01.10.2026) — «union с текущими»
 * считался от пустого списка, и обновление отвязывало контакты сделки.
 *
 * Возвращает id контактов, для которых поставлена привязка.
 */
export function queueDealContactLinks(
    bitrix: BitrixService,
    buffer: Pick<IBatchGroupBuffer, 'queue'>,
    input: {
        dealId: number;
        contactIds: readonly number[];
        /** Префикс ключей команд: `<prefix>_<contactId>`. */
        cmdPrefix: string;
    },
): number[] {
    const contactIds = [
        ...new Set(
            input.contactIds.filter(id => Number.isInteger(id) && id > 0),
        ),
    ].slice(0, MAX_DEAL_CONTACT_LINKS);
    for (const contactId of contactIds) {
        buffer.queue(() =>
            bitrix.batch.deal.contactAdd(
                `${input.cmdPrefix}_${contactId}`,
                input.dealId,
                { CONTACT_ID: contactId },
            ),
        );
    }
    return contactIds;
}
