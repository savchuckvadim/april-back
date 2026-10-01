import { DUPLICATE_ACTION } from '../constants/duplicate-report.const';
import {
    ClassifiedClient,
    DuplicateReportRunResult,
} from '../types/duplicate-report.types';

export interface DuplicateSummaryInput {
    readonly domain: string;
    readonly countOnly: boolean;
    readonly scanned: number;
    readonly clients: readonly ClassifiedClient[];
    readonly recipients: number;
    readonly warnings: readonly string[];
}

/**
 * Цифры прогона для Telegram и лога. Задачи считает доставка: здесь —
 * нули, их перекрывает итог доставки (при «только считать» так и остаются).
 */
export function summarizeDuplicateReport(
    input: DuplicateSummaryInput,
): DuplicateReportRunResult {
    const clients = input.clients;
    const decide = clients.filter(
        client => client.action === DUPLICATE_ACTION.decide,
    ).length;
    return {
        domain: input.domain,
        countOnly: input.countOnly,
        scanned: input.scanned,
        clients: clients.length,
        deals: clients.reduce((sum, client) => sum + client.deals.length, 0),
        decide,
        join: clients.length - decide,
        newThisWeek: clients.filter(client => client.newThisWeek).length,
        recipients: input.recipients,
        tasksCreated: 0,
        tasksClosed: 0,
        warnings: input.warnings,
    };
}
