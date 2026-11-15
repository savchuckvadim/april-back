import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadClosingCase } from './lead-closing.reader';
import {
    LeadClosingJournalEntry,
    LeadClosingWriter,
} from './lead-closing.writer';
import { LeadClosingWorkReader } from './lead-closing-work.reader';
import {
    LeadClosingActivityMove,
    LeadClosingTaskAction,
    LeadClosingWorkPlan,
    planLeadClosingWork,
} from './lead-closing-work.plan';
import {
    activityCmds,
    approveCmd,
    LeadClosingWorkWriter,
    taskCmd,
} from './lead-closing-work.writer';

type Ok<T> = T & { ok: boolean | null };

/** Итог по лиду: решение, что записано и что прошло — строка журнала. */
export interface LeadClosingLine {
    leadId: number;
    case: LeadClosingCase;
    entry: LeadClosingJournalEntry | null;
    leadOk: boolean | null;
    linkOk: boolean | null;
    /** approved: принята за постановщика («Ждёт контроля» → «Завершена»). */
    tasks: (Ok<LeadClosingTaskAction> & { approved?: boolean | null })[];
    activities: Ok<LeadClosingActivityMove>[];
    /** work_failed — команда по задаче/делу не прошла, лид не закрыт. */
    skipped: string | null;
    errors: string[];
}

/**
 * Закрытие порции лидов — одно для разового прогона и отчёта «Звонков»:
 *  1) задачи и дела лидов (снять лид / перенести в сделку / закрыть) —
 *     отдельной пачкой: Битрикс закрывает открытые задачи лида вместе с ним;
 *  2) закрытые задачи «Ждёт контроля» — принять за постановщика;
 *  3) статус лида и «Лид» в сделке/компании — только у лидов, чьи команды
 *     по задачам прошли.
 * Каждая очередь отправляется сразу — общий batch-аккумулятор инстанса
 * пустым уходит к следующему шагу.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadClosingRunner {
    private readonly workReader: LeadClosingWorkReader;
    private readonly workWriter: LeadClosingWorkWriter;
    private readonly writer: LeadClosingWriter;

    constructor(
        private readonly bitrix: BitrixService,
        portal: PortalModel,
    ) {
        this.workReader = new LeadClosingWorkReader(bitrix);
        this.workWriter = new LeadClosingWorkWriter(bitrix);
        this.writer = new LeadClosingWriter(bitrix, portal);
    }

    /** План без записи — для холостого прогона. */
    async preview(cases: LeadClosingCase[]): Promise<LeadClosingLine[]> {
        return this.lines(cases, await this.plan(cases), null);
    }

    async close(cases: LeadClosingCase[]): Promise<LeadClosingLine[]> {
        const plan = await this.plan(cases);
        const workErrors =
            this.workWriter.queue(plan) > 0
                ? await this.send()
                : new Map<string, string>();
        const lines = this.lines(cases, plan, workErrors);
        await this.approve(lines);

        const ready = cases.filter(
            item => !lines.find(line => line.leadId === item.lead.id)?.skipped,
        );
        const entries = this.writer.queue(ready);
        const errors = entries.some(e => e.leadCmd || e.linkCmd)
            ? await this.send()
            : new Map<string, string>();
        for (const entry of entries) {
            const line = lines.find(l => l.leadId === entry.leadId);
            if (!line) continue;
            line.entry = entry;
            line.leadOk = entry.leadCmd ? !errors.has(entry.leadCmd) : null;
            line.linkOk = entry.linkCmd ? !errors.has(entry.linkCmd) : null;
            for (const cmd of [entry.leadCmd, entry.linkCmd]) {
                if (cmd && errors.has(cmd)) {
                    line.errors.push(`${cmd}: ${errors.get(cmd)}`);
                }
            }
        }
        return lines;
    }

    private async plan(cases: LeadClosingCase[]): Promise<LeadClosingWorkPlan> {
        const closing = cases.filter(item => item.decision.target !== null);
        return planLeadClosingWork(
            cases,
            await this.workReader.read(closing.map(item => item.lead.id)),
        );
    }

    /** Закрытые задачи, вставшие в «Ждёт контроля», — принять за постановщика. */
    private async approve(lines: LeadClosingLine[]): Promise<void> {
        const closed = lines.flatMap(line =>
            line.tasks
                .filter(t => t.action === 'close' && t.ok)
                .map(t => t.taskId),
        );
        const waiting = closed.length
            ? await this.workReader.awaitingControl(closed)
            : [];
        if (!waiting.length) return;
        this.workWriter.queueApprove(waiting);
        const errors = await this.send();
        for (const line of lines) {
            for (const task of line.tasks) {
                if (waiting.includes(task.taskId)) {
                    task.approved = !errors.has(approveCmd(task.taskId));
                }
            }
        }
    }

    private lines(
        cases: LeadClosingCase[],
        plan: LeadClosingWorkPlan,
        errors: Map<string, string> | null,
    ): LeadClosingLine[] {
        const okOf = (cmds: string[]): boolean | null =>
            errors ? cmds.every(cmd => !errors.has(cmd)) : null;
        return cases.map(item => {
            const id = item.lead.id;
            const touching = [
                ...plan.tasks.filter(t => t.leadIds.includes(id)).map(taskCmd),
                ...plan.activities
                    .filter(a => a.leadId === id)
                    .flatMap(a => [activityCmds(a).add, activityCmds(a).del]),
            ];
            const failed = errors
                ? touching
                      .filter(cmd => errors.has(cmd))
                      .map(cmd => `${cmd}: ${errors.get(cmd)}`)
                : [];
            return {
                leadId: id,
                case: item,
                entry: null,
                leadOk: null,
                linkOk: null,
                // Действие с задачей журналируется у первого закрываемого лида.
                tasks: plan.tasks
                    .filter(t => t.leadIds[0] === id)
                    .map(t => ({ ...t, ok: okOf([taskCmd(t)]) })),
                activities: plan.activities
                    .filter(a => a.leadId === id)
                    .map(a => ({
                        ...a,
                        ok: okOf([activityCmds(a).add, activityCmds(a).del]),
                    })),
                skipped: failed.length ? 'work_failed' : null,
                errors: failed,
            };
        });
    }

    private async send(): Promise<Map<string, string>> {
        const results = await this.bitrix.api.callBatchWithConcurrency(1);
        const errors = new Map<string, string>();
        for (const result of results) {
            if (Array.isArray(result.result_error)) continue;
            for (const [cmd, error] of Object.entries(result.result_error)) {
                errors.set(cmd, `${error.error}: ${error.error_description}`);
            }
        }
        return errors;
    }
}
