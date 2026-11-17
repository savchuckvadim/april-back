import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    buildDealMovementNote,
    markDealMovementNotified,
    needsDealMovementTodo,
    type DealMovementNightPlan,
    type DealMovementNotesSummary,
    type DealMovementStateEntry,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import type { ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { DEAL_MOVEMENT_NOTES } from '../constants/deal-movement.const';
import { dealMovementPause } from '../lib/deal-movement-pause';
import type {
    DealMovementCallPointers,
    DealMovementNotesOptions,
} from '../types/deal-movement.types';
import { DealMovementNightCounters } from './deal-movement-night-counters';
import { DealMovementNoteWriter } from './deal-movement-note.writer';
import { DealMovementStateStore } from './deal-movement-state.store';
import { DealMovementTodoService } from './deal-movement-todo.service';

export interface DealMovementNotesInput {
    readonly domain: string;
    /** День портала 'YYYY-MM-DD' — ключ счётчиков ночи. */
    readonly day: string;
    readonly timezone: ETimeZone;
    readonly plan: Pick<DealMovementNightPlan, 'state' | 'toNotify'>;
    readonly verdicts: ReadonlyMap<string, DealMovementVerdict>;
    readonly pointers: ReadonlyMap<string, DealMovementCallPointers>;
    readonly options: DealMovementNotesOptions;
    /** Итог записей прогона: счётчики растут по ходу (видно в админке). */
    readonly summary: DealMovementNotesSummary;
    /** Момент прогона, ISO — `notifiedAt` записанных сделок. */
    readonly now: string;
    /** Пауза между записями, мс. */
    readonly pauseMs: number;
    /** После каждой записи: продлить замок и сохранить ход прогона. */
    readonly onProgress: () => Promise<void>;
}

export interface DealMovementNotesOutcome {
    /** Сделки, которым запись ушла этим прогоном. */
    readonly written: Set<string>;
    /** Сбои записи и модели словами (не больше трёх). */
    readonly warnings: string[];
}

/**
 * Запись движения сделок в ленты сделок (решение 17.11.2026): по одной,
 * с паузой, в порядке плана (важные первыми). Удалась — `notifiedStatus`
 * сдвигается и ЭТА сделка сразу сохраняется в хеш состояния (одно поле),
 * счётчик ночи растёт; не удалась — расхождение остаётся до следующей
 * ночи, в итоге — «не удалось». «Что сделать» — только у тревожных
 * статусов и в пределах лимита подсказок за ночь.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова: в поля
 * кладём лишь PBXService и сервисы без bitrix-состояния (CLAUDE.md).
 */
@Injectable()
export class DealMovementNotesService {
    constructor(
        private readonly pbx: PBXService,
        private readonly stateStore: DealMovementStateStore,
        private readonly counters: DealMovementNightCounters,
        private readonly todo: DealMovementTodoService,
    ) {}

    /** Сколько записей ещё можно этой ночью; запись выключена — ноль. */
    async remaining(
        domain: string,
        day: string,
        options: DealMovementNotesOptions,
    ): Promise<number> {
        if (!options.write) return 0;
        const used = await this.counters.used(domain, day, 'notes');
        return Math.max(0, options.maxNotes - used);
    }

    async write(
        input: DealMovementNotesInput,
    ): Promise<DealMovementNotesOutcome> {
        const written = new Set<string>();
        const warnings: string[] = [];
        if (input.plan.toNotify.length === 0) return { written, warnings };
        const { bitrix } = await this.pbx.init(input.domain);
        const writer = new DealMovementNoteWriter(bitrix);
        const model = await this.todo.modelOf(input.domain);
        for (const [index, dealId] of input.plan.toNotify.entries()) {
            if (index > 0) await dealMovementPause(input.pauseMs);
            const entry = input.plan.state.get(dealId);
            const verdict = input.verdicts.get(dealId);
            if (entry === undefined || verdict === undefined) continue;
            const note = buildDealMovementNote({
                verdict,
                from: entry.notifiedStatus,
                actions: await this.actionsFor(input, verdict, model, warnings),
            });
            try {
                await writer.write(Number(dealId), note, input.options.kind);
            } catch (error) {
                input.summary.failed += 1;
                this.warn(
                    warnings,
                    `не удалось записать в ленту сделки ${dealId}: ${getErrorString(error)}`,
                );
                await input.onProgress();
                continue;
            }
            await this.markWritten(input, dealId, entry);
            written.add(dealId);
            await input.onProgress();
        }
        return { written, warnings };
    }

    /** Запись ушла: сделке «сказали» — сразу в хеш и в счётчик ночи. */
    private async markWritten(
        input: DealMovementNotesInput,
        dealId: string,
        entry: DealMovementStateEntry,
    ): Promise<void> {
        const marked = markDealMovementNotified(entry, input.now);
        input.plan.state.set(dealId, marked);
        input.summary.written += 1;
        await this.counters.increment(input.domain, input.day, 'notes');
        await this.stateStore.saveEntry(input.domain, dealId, marked);
    }

    /** «Что сделать» в пределах лимита ночи; null — запись без блока. */
    private async actionsFor(
        input: DealMovementNotesInput,
        verdict: DealMovementVerdict,
        model: string | null,
        warnings: string[],
    ): Promise<string[] | null> {
        if (!needsDealMovementTodo(verdict.status)) return null;
        const used = await this.counters.used(input.domain, input.day, 'texts');
        if (used >= input.options.maxTexts) return null;
        await this.counters.increment(input.domain, input.day, 'texts');
        const outcome = await this.todo.actionsFor({
            domain: input.domain,
            model,
            timezone: input.timezone,
            verdict,
            pointers: input.pointers.get(verdict.dealId) ?? null,
        });
        if (outcome.actions === null) {
            input.summary.textsFailed += 1;
        } else {
            input.summary.texts += 1;
        }
        if (outcome.error !== null) {
            this.warn(
                warnings,
                `модель не написала «что сделать» по сделке ${verdict.dealId}: ${outcome.error}`,
            );
        }
        return outcome.actions;
    }

    private warn(warnings: string[], text: string): void {
        if (warnings.length < DEAL_MOVEMENT_NOTES.warningsShown) {
            warnings.push(text);
        }
    }
}
