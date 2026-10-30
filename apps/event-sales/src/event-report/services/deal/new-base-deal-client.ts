import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import {
    IBXDeal,
    IBXDealContactBinding,
} from '@/modules/bitrix/domain/crm/deal/interface/bx-deal.interface';
import { clientTitleOrNull } from '../../../shared/client-title';
import { positiveId } from './deal-notice.util';

/** Поля карточек, из которых складывается клиент новой сделки. */
type ClientRow = Partial<
    Record<
        | 'ID'
        | 'TITLE'
        | 'COMPANY_ID'
        | 'COMPANY_TITLE'
        | 'CONTACT_ID'
        | 'CATEGORY_ID'
        | 'NAME'
        | 'LAST_NAME'
        | 'SECOND_NAME',
        unknown
    >
>;

export interface NewBaseDealClientSource {
    /** Компания-якорь отчёта; её COMPANY_ID уже пишет `ownerLinkFields`. */
    company: ClientRow | null;
    lead: ClientRow | null;
    /** Сделка, из которой открыли приложение. */
    ownerDeal: ClientRow | null;
    /** Все контакты сделки запуска (`crm.deal.contact.items.get`). */
    ownerDealContactIds: readonly number[];
    planContact: ClientRow | null;
    reportContact: ClientRow | null;
    /** Битрикс-id категории «ОП Основная». */
    baseCategoryId: string;
}

/** Контакты сделки: первичный первым — он станет CONTACT_ID новой сделки. */
export const parseDealContactItems = (
    items: readonly IBXDealContactBinding[] | null,
): number[] => {
    const rows = items ?? [];
    return [
        ...rows.filter(item => item.IS_PRIMARY === 'Y'),
        ...rows.filter(item => item.IS_PRIMARY !== 'Y'),
    ]
        .map(item => positiveId(item.CONTACT_ID))
        .filter((id): id is number => id !== null);
};

const contactName = (contact: ClientRow | null): string | null =>
    clientTitleOrNull(
        [contact?.LAST_NAME, contact?.NAME, contact?.SECOND_NAME]
            .filter((part): part is string => typeof part === 'string')
            .map(part => part.trim())
            .filter(Boolean)
            .join(' '),
    );

/**
 * Клиент НОВОЙ основной сделки отчёта: название, компания, контакты.
 *
 * Сделка создавалась только из полей отчёта. Битрикс называл её «Сделка #N»
 * (590 за октябрь на garantservisvoronezh), а у клиента без компании она
 * оставалась вообще без клиента: 30.10.2026 доработка из закрытой #28477
 * (два контакта) создала пустую #110153, номера для звонка в ней не было.
 *
 * Название — по клиенту, как у лид-хука (решение 13.10.2026, baseDealTitle):
 * компания → основная сделка запуска → лид → контакт. Названия ХО и
 * презентации клиентом не считаем. Ничего не нашлось — поля нет, сделку
 * назовёт Битрикс.
 *
 * Только для создания: CONTACT_IDS в обновлении отвязал бы контакты
 * существующей сделки (см. deal-contact-links).
 */
export const newBaseDealClientFields = (
    source: NewBaseDealClientSource,
): Partial<IBXDeal> => {
    const { company, lead, ownerDeal, planContact, reportContact } = source;
    // Сделка другой компании: её название и контакты — чужие.
    const ownerIsSameClient =
        !!ownerDeal &&
        (!company ||
            positiveId(ownerDeal.COMPANY_ID) === positiveId(company.ID));
    const ownerIsBase =
        ownerIsSameClient &&
        String(ownerDeal.CATEGORY_ID) === source.baseCategoryId;

    const title =
        clientTitleOrNull(company?.TITLE) ??
        (ownerIsBase ? clientTitleOrNull(ownerDeal.TITLE) : null) ??
        clientTitleOrNull(lead?.COMPANY_TITLE) ??
        clientTitleOrNull(lead?.TITLE) ??
        contactName(planContact) ??
        contactName(reportContact);

    const ownerContacts: readonly unknown[] = !ownerIsSameClient
        ? []
        : source.ownerDealContactIds.length
          ? source.ownerDealContactIds
          : [ownerDeal.CONTACT_ID];
    const contactIds = [
        ...new Set(
            [
                ...ownerContacts,
                lead?.CONTACT_ID,
                planContact?.ID,
                reportContact?.ID,
            ]
                .map(positiveId)
                .filter((id): id is number => id !== null),
        ),
    ];

    const companyId = company ? null : positiveId(ownerDeal?.COMPANY_ID);

    return {
        ...(title ? { TITLE: toBatchSafeText(title) } : {}),
        ...(companyId ? { COMPANY_ID: String(companyId) } : {}),
        ...(contactIds.length
            ? { CONTACT_ID: String(contactIds[0]), CONTACT_IDS: contactIds }
            : {}),
    };
};
