import { HookCatalogEntry } from '../hook-catalog.types';
import { JOIN_TO_MAIN_ENTRY } from './join-to-main.entry';
import { CONVERT_NORMALIZER_ENTRY } from './convert-normalizer.entry';
import { MERGE_DUPLICATES_ENTRY } from './merge-duplicates.entry';
import { TRANSFER_WORK_ENTRY } from './transfer-work.entry';
import { CLIENT_WORK_ENTRY } from './client-work.entry';
import { DEAL_AUDIT_ENTRY } from './deal-audit.entry';
import { DUPLICATE_REPORT_ENTRY } from './duplicate-report.entry';

/**
 * Семейство дублей и передачи работы: присоединение к основной,
 * нормализатор конвертации, слияние, передать/забрать работу, «открытые
 * сделки по клиенту», аудит сделок, отчёт по дублям.
 */
export const DUPLICATES_FAMILY_ENTRIES: HookCatalogEntry[] = [
    JOIN_TO_MAIN_ENTRY,
    CONVERT_NORMALIZER_ENTRY,
    MERGE_DUPLICATES_ENTRY,
    TRANSFER_WORK_ENTRY,
    CLIENT_WORK_ENTRY,
    DEAL_AUDIT_ENTRY,
    DUPLICATE_REPORT_ENTRY,
];
