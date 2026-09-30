/**
 * Периметр строк вкладки «AI аналитика» (решение владельца 30.09.2026):
 * только сотрудники, чьи звонки разбирает AI, с учётом глобального
 * фильтра отчёта. Строки = (выбранные в фильтре или весь ростер ОП) ∩
 * список разбора (portal_ai_settings.allowed_user_ids).
 *
 * Список разбора действует, только когда разбор включён и список непуст
 * (зеркало фронтового aiPilotIds). Пустой список — разбирается весь ОП,
 * ограничения нет; разбор выключен или запись не прочитана — тоже без
 * ограничения (fail-open: сбой чтения настроек не гасит витрину).
 *
 * Чистые функции без DI; чтение настроек и ростера — в
 * AiManagerScopeResolver (единственное место пересечения).
 */
import type { AiCallReportStatus } from '../loaders/settings.loader';
import { normalizeManagerIds } from '../loaders/managers.loader';

/** Кого показывать во вкладке AI: итог пересечения фильтра и списка разбора. */
export interface AiManagerScope {
    /** Bitrix-id сотрудников строк по возрастанию. */
    managerIds: number[];
    /** Список разбора действует (разбор включён, список непуст). */
    pilotActive: boolean;
    /**
     * Сколько сотрудников явного фильтра скрыто: их звонки AI не разбирает.
     * Без явного фильтра — 0 (ростер при действующем списке не читается).
     */
    hiddenByPilot: number;
    /** Ни одного сотрудника: обзор пустой, ключ кэша с маркером none. */
    empty: boolean;
}

/** Вход расчёта периметра. */
export interface AiManagerScopeInput {
    /** Явный фильтр отчёта (managerIds запроса); пусто — фильтра нет. */
    requested?: readonly (string | number | null | undefined)[];
    /** Ростер ОП по структуре: нужен, только если нет ни фильтра, ни списка. */
    roster: readonly number[];
    /** Действующий список разбора (activePilotIds); null — ограничения нет. */
    pilot: readonly number[] | null;
}

/**
 * Ответ ручек при пустом периметре (итоги периода): в фильтре отчёта нет
 * ни одного сотрудника из разбора. Текст для руководителя — без кодов.
 */
export const AI_MANAGER_SCOPE_EMPTY_MESSAGE =
    'В выбранном фильтре нет сотрудников, чьи звонки разбирает AI. ' +
    'Выберите в фильтре отчёта сотрудников из разбора или попросите ' +
    'разработчика добавить нужных сотрудников в разбор.';

/**
 * Действующий список разбора: только при включённом разборе и непустом
 * списке; иначе null — ограничения нет (статус не прочитан — тоже null).
 */
export function activePilotIds(status?: AiCallReportStatus): number[] | null {
    if (!status?.enabled) return null;
    const pilot = normalizeManagerIds(status.pilotUserIds ?? []);

    return pilot.length > 0 ? pilot : null;
}

/**
 * Периметр строк: явный фильтр ∩ список разбора; без фильтра — список
 * разбора целиком (сюда попадают и сотрудники вне структуры ОП), а без
 * списка — ростер ОП. Мусор и дубли id отбрасываются нормализацией.
 */
export function resolveManagerScope(
    input: AiManagerScopeInput,
): AiManagerScope {
    const requested = normalizeManagerIds(input.requested ?? []);
    const pilotIds = normalizeManagerIds(input.pilot ?? []);
    const pilot = pilotIds.length > 0 ? new Set(pilotIds) : null;
    const base =
        requested.length > 0
            ? requested
            : pilot !== null
              ? pilotIds
              : normalizeManagerIds(input.roster);
    const managerIds = pilot === null ? base : base.filter(id => pilot.has(id));

    return {
        managerIds,
        pilotActive: pilot !== null,
        hiddenByPilot:
            requested.length > 0 ? requested.length - managerIds.length : 0,
        empty: managerIds.length === 0,
    };
}
