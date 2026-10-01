import { ETimeZone, parseBitrixField } from '@lib/shared/lib/date';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';
import {
    contactFullName,
    entityTitleOr,
} from '../../shared/bitrix/crm-entity-name.util';
import { isOpenTaskStatus } from '../../shared/bitrix/open-task-statuses';
import { toId } from '../../shared/department-heads/department-heads.util';
import {
    DuplicateLead,
    DuplicateOpenTask,
} from '../types/duplicate-report.types';
import { clientKey } from './duplicate-groups';

/**
 * Разбор строк Битрикса второго прохода отчёта — чистые функции: ответы
 * приходят `unknown`, здесь они становятся подписями, лидами и числами.
 */

export type BxRow = Record<string, unknown>;

/** Ответ list-метода массивом строк; не массив — пусто. */
export const rowsOf = (raw: unknown): BxRow[] =>
    Array.isArray(raw)
        ? raw.filter((row): row is BxRow => !!row && typeof row === 'object')
        : [];

/** Значение поля заполнено: непустое, не «0», у списка — хоть один элемент. */
export const isFilled = (raw: unknown): boolean =>
    Array.isArray(raw)
        ? raw.some(isFilled)
        : !['', '0'].includes(scalarText(raw).trim());

/**
 * Ответ `tasks.task.list` (`{ tasks: [...] }` или массив) → открытые задачи
 * с ответственным. Открытая — как у аудита сделок: «Отложенная» не в счёт.
 */
export const openTasksOf = (raw: unknown): DuplicateOpenTask[] => {
    const tasks = Array.isArray(raw)
        ? rowsOf(raw)
        : rowsOf((raw as { tasks?: unknown } | null)?.tasks);
    const result: DuplicateOpenTask[] = [];
    for (const task of tasks) {
        const id = toId(task['id'] ?? task['ID']);
        const status = scalarText(task['status'] ?? task['STATUS']);
        if (!id || !isOpenTaskStatus(status)) continue;
        result.push({
            id,
            responsibleId: toId(
                task['responsibleId'] ?? task['RESPONSIBLE_ID'],
            ),
        });
    }
    return result;
};

/** Подписи клиентов (ключ — clientKey) и ИНН компаний цифрами. */
export function clientCaptions(
    companies: readonly BxRow[],
    contacts: readonly BxRow[],
    companyInnField: string | null,
): { titles: Map<string, string>; inns: Map<string, string> } {
    const titles = new Map<string, string>();
    const inns = new Map<string, string>();
    for (const row of companies) {
        const id = toId(row['ID']);
        if (!id) continue;
        const key = clientKey({ kind: 'company', id });
        titles.set(key, entityTitleOr(row['TITLE'], `Компания ${id}`));
        const inn = companyInnField
            ? scalarText(row[companyInnField]).replace(/\D/g, '')
            : '';
        if (inn) inns.set(key, inn);
    }
    for (const row of contacts) {
        const id = toId(row['ID']);
        if (!id) continue;
        const name = contactFullName({
            NAME: scalarText(row['NAME']),
            LAST_NAME: scalarText(row['LAST_NAME']),
            SECOND_NAME: scalarText(row['SECOND_NAME']),
        });
        titles.set(clientKey({ kind: 'contact', id }), name || `Контакт ${id}`);
    }
    return { titles, inns };
}

/** Справочник источников (`crm.status.list`) → «код → название». */
export const sourceNameMap = (rows: readonly BxRow[]): Map<string, string> =>
    new Map(
        rows.map(row => [
            scalarText(row['STATUS_ID']),
            scalarText(row['NAME']).trim(),
        ]),
    );

/**
 * Строка лида → лид отчёта; null — строки без id. Источник — название из
 * справочника портала (код источника людям ничего не скажет).
 */
export function toDuplicateLead(
    row: BxRow,
    sources: ReadonlyMap<string, string>,
    siteField: string | null,
    tz: ETimeZone,
): DuplicateLead | null {
    const id = toId(row['ID']);
    if (!id) return null;
    const created = parseBitrixField(row['DATE_CREATE'], tz);
    return {
        id,
        title: scalarText(row['TITLE']).trim(),
        createdAt: created ? created.valueOf() : null,
        sourceName: sources.get(scalarText(row['SOURCE_ID'])) ?? '',
        isRequest: siteField ? isFilled(row[siteField]) : false,
    };
}
