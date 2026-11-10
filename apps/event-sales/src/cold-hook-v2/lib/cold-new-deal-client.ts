import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { IBXDeal } from '@/modules/bitrix';
import { XO_START_BASE_DEAL_TITLE_MODE } from '@lib/portal-lib/store/app-settings';
import { clientTitleOrNull } from '../../shared/client-title';
import { ColdOwner } from '../services/enities/cold-owner.type';
import { ColdTarget } from '../services/target/cold-target.types';

/**
 * Клиент НОВЫХ сделок холодного старта: контакты и название основной.
 *
 * Запуск ХО из компании создавал сделки только с COMPANY_ID: основная
 * получала заглушку Битрикса «Сделка #N», а контактов клиента в карточках
 * не было (garant, компания 7719, 10.11.2026 — у компании два контакта,
 * в сделке ХО ни одного). Менеджер работает из сделки, и звонить ему было
 * некому.
 */
export interface ColdNewDealClient {
    /** Контакты клиента для НОВЫХ сделок; первый станет CONTACT_ID. */
    contactIds: readonly number[];
    /** Название новой основной; null — сделку назовёт Битрикс. */
    baseDealTitle: string | null;
}

export const EMPTY_COLD_NEW_DEAL_CLIENT: ColdNewDealClient = {
    contactIds: [],
    baseDealTitle: null,
};

const positiveIds = (raw: readonly unknown[]): number[] => [
    ...new Set(raw.map(Number).filter(id => Number.isInteger(id) && id > 0)),
];

/**
 * Название новой основной по настройке `xo_start_base_deal_title`.
 *
 * `client` — название клиента: компания, а у клиента без компании —
 * входная сделка, если она сама основная (у сделок ХО и презентации
 * название — вид события, не клиент). Заглушки («Сделка #N», ИНН вместо
 * названия) пропускаются — тогда, как и в режиме `default`, называет Битрикс.
 */
const baseDealTitle = (
    target: ColdTarget,
    titleMode: string,
): string | null => {
    if (titleMode !== XO_START_BASE_DEAL_TITLE_MODE.client) return null;
    const entryIsRoot =
        !!target.entryDeal &&
        target.rootDealId !== null &&
        Number(target.entryDeal.ID) === target.rootDealId;
    const title =
        clientTitleOrNull(target.company?.TITLE) ??
        (entryIsRoot ? clientTitleOrNull(target.entryDeal?.TITLE) : null);
    return title ? toBatchSafeText(title) : null;
};

export const buildColdNewDealClient = (
    target: ColdTarget,
    contactIds: readonly number[],
    titleMode: string,
): ColdNewDealClient => ({
    contactIds: positiveIds(contactIds),
    baseDealTitle: baseDealTitle(target, titleMode),
});

/**
 * Поля контактов НОВОЙ сделки. У клиента без компании первым идёт контакт
 * входной сделки — он и раньше был её CONTACT_ID.
 *
 * Только для создания: CONTACT_IDS в обновлении отвязал бы контакты
 * существующей сделки (см. deal-contact-links).
 */
export const coldNewDealContactFields = (
    owner: ColdOwner,
    contactIds: readonly number[],
): Partial<IBXDeal> => {
    const ids = positiveIds([
        owner.kind === 'deal' ? owner.contactId : null,
        ...contactIds,
    ]);
    return ids.length ? { CONTACT_ID: String(ids[0]), CONTACT_IDS: ids } : {};
};
