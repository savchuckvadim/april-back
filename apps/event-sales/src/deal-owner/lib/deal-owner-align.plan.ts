/** Сущность клиента и её текущий ответственный. */
export interface IOwnedEntity {
    id: number;
    responsibleId: number | null;
}

export interface IDealOwnerAlignInput {
    /** Кто открыл сделку в «Звонках». */
    userId: number;
    dealResponsibleId: number | null;
    closed: boolean;
    company: IOwnedEntity | null;
    contacts: readonly IOwnedEntity[];
    /** Открытые лиды заявки (первоисточник и присоединённые). */
    leads: readonly IOwnedEntity[];
}

/**
 * Причина, по которой выравнивать нечего. `recent` — сервер недавно уже
 * выравнивал эту сделку для сотрудника (ставит сценарий, не план).
 */
export const DEAL_OWNER_SKIP_REASONS = [
    'not_own',
    'closed',
    'aligned',
    'recent',
] as const;
export type DealOwnerSkipReason = (typeof DEAL_OWNER_SKIP_REASONS)[number];

export type DealOwnerAlignPlan =
    | { skip: DealOwnerSkipReason }
    | {
          responsibleId: number;
          companyId: number | null;
          contactIds: number[];
          leadIds: number[];
      };

/**
 * Компания, контакты и лиды заявки — за ответственным сделки, по которой
 * сейчас работают (владелец 22.10.2026, лиды — 03.11.2026). На garant
 * компанию и контакты выравнивает и бизнес-процесс при изменении сделки,
 * но перенесённые сделки, которых никто не трогал, остались с компанией и
 * контактами прежнего менеджера, и Битрикс отказывал новому в записи.
 *
 * Лиды: ответственного сделки меняют руками в карточке (руководитель
 * раздаёт заявки), а лид остаётся на прежнем — карточка сделки лида не
 * показывает. Лид следует за сделкой, иначе SLA передаст заявку по кругу и
 * отменит ручной выбор.
 *
 * Выравниваем только при открытии СВОЕЙ открытой сделки: чужую сделку
 * сотрудник может смотреть, но не забирает этим её клиента. Переназначаем
 * только тех, у кого ответственный другой.
 */
export function planDealOwnerAlign(
    input: IDealOwnerAlignInput,
): DealOwnerAlignPlan {
    const owner = input.dealResponsibleId;
    if (!owner || owner !== input.userId) return { skip: 'not_own' };
    if (input.closed) return { skip: 'closed' };

    const companyId =
        input.company && input.company.responsibleId !== owner
            ? input.company.id
            : null;
    const contactIds = foreignIds(input.contacts, owner);
    const leadIds = foreignIds(input.leads, owner);
    if (!companyId && !contactIds.length && !leadIds.length) {
        return { skip: 'aligned' };
    }
    return { responsibleId: owner, companyId, contactIds, leadIds };
}

/** Id сущностей с другим ответственным, без дублей. */
function foreignIds(
    entities: readonly IOwnedEntity[],
    owner: number,
): number[] {
    return [
        ...new Set(
            entities
                .filter(entity => entity.responsibleId !== owner)
                .map(entity => entity.id),
        ),
    ];
}
