import {
    DUPLICATE_DECIDE_REASON,
    DuplicateDecideReason,
} from '../../../duplicate-report/constants/duplicate-report.const';
import {
    howWorkedText,
    originLabel,
    personName,
} from '../../../duplicate-report/lib/duplicate-report-texts';
import {
    ClassifiedClient,
    ClassifiedDeal,
} from '../../../duplicate-report/types/duplicate-report.types';
import {
    ClientWorkDealDto,
    ClientWorkResponseDto,
} from '../dto/client-work.dto';

/**
 * «Работа клиента» для фронта — чистые функции: разобранный клиент →
 * ответ ручки, выбор руководителя → понятная ошибка. Тексты по-русски,
 * без кодов: их читает руководитель (правила текстов UI).
 */

const NOTE_BY_REASON: Record<DuplicateDecideReason, string> = {
    [DUPLICATE_DECIDE_REASON.parallelWork]:
        'Клиента ведут два менеджера — сначала решите, кто ведёт, и оставьте ' +
        'основной его сделку.',
    [DUPLICATE_DECIDE_REASON.differentInn]:
        'У сделок разные ИНН — сначала проверьте, одна ли это организация. ' +
        'До проверки не присоединяйте.',
};

export const CLIENT_WORK_HINT = {
    noClient:
        'Открытых сделок клиента в воронке продаж нет (или у сделки нет ни ' +
        'компании, ни контакта) — присоединять нечего.',
    single: 'У клиента одна открытая сделка в воронке продаж — присоединять нечего.',
    noRights:
        'Присоединять сделки клиента может только руководитель отдела продаж.',
} as const;

export interface ClientWorkView {
    /** Сделка, из которой открыт блок. */
    readonly currentDealId: number;
    readonly names: ReadonlyMap<number, string>;
    /** Сотрудник — руководитель (проверено на сервере). */
    readonly canJoin: boolean;
}

const iso = (ms: number | null): string | null =>
    ms === null ? null : new Date(ms).toISOString();

const toDealDto = (
    item: ClassifiedDeal,
    view: ClientWorkView,
): ClientWorkDealDto => ({
    id: item.deal.id,
    title: item.deal.title,
    stageName: item.deal.stageName,
    responsibleId: item.deal.assignedById,
    responsibleName: personName(item.deal.assignedById, view.names),
    responsibleWorking: item.working,
    ownWork: item.recentWork,
    opportunity: item.deal.opportunity,
    openTasks: item.deal.openTasks,
    createdAt: iso(item.deal.createdAt),
    modifiedAt: iso(item.deal.modifiedAt),
    origin: originLabel(item),
    isMain: item.isMain,
    isFreshest: item.isFreshest,
    isCurrent: item.deal.id === view.currentDealId,
});

/** Разобранный клиент → ответ ручки «Работа клиента». */
export function toClientWorkResponse(
    client: ClassifiedClient | null,
    view: ClientWorkView,
): ClientWorkResponseDto {
    if (!client) {
        return {
            client: null,
            deals: [],
            suggestedMainDealId: null,
            freshestDealId: null,
            notes: [],
            howWorked: null,
            canJoin: false,
            hint: CLIENT_WORK_HINT.noClient,
        };
    }
    const single = client.deals.length < 2;
    return {
        client: {
            kind: client.ref.kind,
            id: client.ref.id,
            title: client.title,
            inn: client.inn,
        },
        deals: client.deals.map(item => toDealDto(item, view)),
        suggestedMainDealId: client.mainDealId,
        freshestDealId: client.freshestDealId,
        notes: client.decideReasons.map(reason => NOTE_BY_REASON[reason]),
        howWorked: single ? null : howWorkedText(client, view.names),
        canJoin: view.canJoin && !single,
        hint: single
            ? CLIENT_WORK_HINT.single
            : view.canJoin
              ? null
              : CLIENT_WORK_HINT.noRights,
    };
}

/** Что присоединять: без повторов и без самой основной. */
export const joinDealIds = (
    mainDealId: number,
    dealIds: readonly number[],
): number[] => [...new Set(dealIds)].filter(id => id !== mainDealId);

/**
 * Проверка выбора по свежему чтению клиента основной сделки: основная и
 * присоединяемые — открытые сделки ЭТОГО клиента в воронке продаж.
 * Список мог устареть (сделку закрыли, присоединили другой кнопкой).
 *
 * @returns текст ошибки для человека; null — выбор верный.
 */
export function joinSelectionError(
    client: ClassifiedClient | null,
    mainDealId: number,
    dealIds: readonly number[],
): string | null {
    const open = new Set(client?.deals.map(item => item.deal.id) ?? []);
    if (!open.has(mainDealId)) {
        return (
            'Основная сделка уже закрыта или не в воронке продаж — обновите ' +
            'список и выберите открытую.'
        );
    }
    const ids = joinDealIds(mainDealId, dealIds);
    if (!ids.length) {
        return 'Отметьте сделки, которые нужно присоединить к основной.';
    }
    const foreign = ids.filter(id => !open.has(id));
    return foreign.length
        ? `Сделки ${foreign.join(', ')} уже закрыты или не относятся к этому ` +
              'клиенту — обновите список.'
        : null;
}
