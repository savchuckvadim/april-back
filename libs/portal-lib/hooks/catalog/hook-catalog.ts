import { HookCatalogEntry, HookFamily } from './hook-catalog.types';
import { LEAD_TO_WORK_ENTRY } from './entries/lead-to-work.entry';
import { LEAD_REQUEST_FAMILY_ENTRIES } from './entries/lead-request.family';
import { COLD_CALL_FAMILY_ENTRIES } from './entries/cold-call.family';
import { DUPLICATES_FAMILY_ENTRIES } from './entries/duplicates.family';

/** Порядок показа семейств в админке. */
export const HOOK_FAMILY_ORDER: readonly HookFamily[] = [
    'sales-hook',
    'lead-request',
    'cold-hook',
    'cron',
];

export const HOOK_FAMILY_TITLES: Record<HookFamily, string> = {
    'sales-hook': 'Хуки отдела продаж (sales-hooks)',
    'lead-request': 'Путь заявки (lead-request)',
    'cold-hook': 'Холодный обзвон (cold-hook)',
    cron: 'Кроны: страховки и отчёты по расписанию',
};

/** Реестр каталога: порядок = порядок в списке внутри семейства. */
export const HOOK_CATALOG: readonly HookCatalogEntry[] = [
    LEAD_TO_WORK_ENTRY,
    ...LEAD_REQUEST_FAMILY_ENTRIES,
    ...COLD_CALL_FAMILY_ENTRIES,
    ...DUPLICATES_FAMILY_ENTRIES,
];

export const HOOK_CODES: readonly string[] = HOOK_CATALOG.map(
    entry => entry.code,
);

export function findHookEntry(code: string): HookCatalogEntry | null {
    return HOOK_CATALOG.find(entry => entry.code === code) ?? null;
}

/** Каталог, отсортированный по семействам в порядке показа. */
export function listHookEntries(): HookCatalogEntry[] {
    const rank = new Map(HOOK_FAMILY_ORDER.map((family, i) => [family, i]));
    return [...HOOK_CATALOG].sort(
        (a, b) => (rank.get(a.family) ?? 99) - (rank.get(b.family) ?? 99),
    );
}
