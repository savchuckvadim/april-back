import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import type {
    DealMovementNightDeal,
    DealMovementProgressCheck,
    DealMovementRunPhase,
    DealMovementStateEntry,
    DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import { needsHistory } from '../lib/deal-movement-dossier.mapper';
import { indexOpenDeals } from '../lib/deal-movement-calls.link';
import { dealMovementProgressChecks } from '../lib/deal-movement-progress-checks';
import {
    dealsNeedingWork,
    evaluateDealRows,
    type DealMovementRowsInput,
} from '../lib/deal-movement-rows.evaluation';
import { dealMovementStageNorms } from '../lib/deal-movement-stage-norms';
import type {
    DealMovementCallPointers,
    DealMovementDealRow,
    DealMovementOptions,
} from '../types/deal-movement.types';
import { DealMovementCallsLoader } from './deal-movement-calls.loader';
import { DealMovementDealsReader } from './deal-movement-deals.reader';
import { DealMovementHistoryReader } from './deal-movement-history.reader';
import { DealMovementWorkReader } from './deal-movement-work.reader';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Итог оценки портала: вердикты ночи и то, что попало под потолок. */
export interface DealMovementEvaluation {
    readonly openTotal: number;
    readonly deals: DealMovementNightDeal[];
    readonly verdicts: Map<string, DealMovementVerdict>;
    /** Звонки для «что сделать» у тревожных статусов. */
    readonly pointers: Map<string, DealMovementCallPointers>;
    /** Открытые сделки сверх потолка: их прошлое состояние сохраняется. */
    readonly carryOver: string[];
    readonly capped: boolean;
    /** Сколько ступеней получили срок по истории портала. */
    readonly stagesByHistory: number;
    /** У скольких сделок читались звонки и дела Битрикса. */
    readonly workProbed: number;
    /** Код ступени лестницы → название стадии на портале. */
    readonly stageTitles: ReadonlyMap<string, string>;
    /** Проверка продвижения звонков 4–5 (витрина «честность оценок»). */
    readonly progressChecks: DealMovementProgressCheck[];
    readonly warnings: string[];
}

/**
 * Оценка открытых сделок портала: досье собирает код, статус — чистые
 * правила библиотеки. Читает из Битрикса сделки (целиком), историю стадий
 * сдвинутых за окно (из неё же — срок стадии по истории портала) и звонки
 * с делами — только у сделок, которым иначе досталось бы «Без внимания»;
 * разобранные звонки — из нашей БД. Ничего не пишет.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова: в поля
 * кладём лишь PBXService и сервисы без bitrix-состояния (CLAUDE.md).
 */
@Injectable()
export class DealMovementEvaluator {
    constructor(
        private readonly pbx: PBXService,
        private readonly calls: DealMovementCallsLoader,
    ) {}

    async evaluate(
        domain: string,
        options: DealMovementOptions,
        now: Date,
        onPhase: (phase: DealMovementRunPhase) => Promise<void>,
        /** Состояние прошлой ночи: последняя активность без нашей записи. */
        previous: ReadonlyMap<string, DealMovementStateEntry> | null = null,
    ): Promise<DealMovementEvaluation> {
        const warnings: string[] = [];
        await onPhase('deals');
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const open = await new DealMovementDealsReader(
            bitrix,
            PortalModel,
        ).loadOpen();
        const { evaluated, carryOver } = applyCap(open.rows, options.maxDeals);
        if (carryOver.length > 0) {
            warnings.push(
                `открытых сделок ${open.rows.length} больше потолка ` +
                    `${options.maxDeals} — оценены самые новые, остальные ` +
                    'сохраняют прошлый статус',
            );
        }

        await onPhase('history');
        const windowStartMs =
            now.getTime() - options.thresholds.windowDays * DAY_MS;
        const historyRead = new Set(
            evaluated
                .filter(row => needsHistory(row, windowStartMs))
                .map(row => row.dealId),
        );
        const history = await new DealMovementHistoryReader(
            bitrix,
            open.categoryId,
            open.stages,
        ).load([...historyRead], warnings);

        await onPhase('calls');
        const callsByDeal = await this.calls.load(
            domain,
            new Date(now.getTime() - options.callsLookbackDays * DAY_MS),
            now,
            // Индекс по ВСЕМ открытым: «у компании одна открытая сделка»
            // считается по воронке целиком, а не по оценённой части.
            indexOpenDeals(open.rows),
        );

        const stageNorms = dealMovementStageNorms(history.dwell);
        const base: DealMovementRowsInput = {
            rows: evaluated,
            transitions: history.transitions,
            calls: callsByDeal,
            work: new Map(),
            stageNorms,
            previous,
            now: now.toISOString(),
            // Дни в текстах причин — по поясу портала.
            thresholds: {
                ...options.thresholds,
                timeZone: resolveTimezoneByDomain(domain),
            },
        };
        let result = evaluateDealRows(base);
        // Звонки и дела Битрикса — только тем, кому грозит «Без внимания».
        const probe = dealsNeedingWork(result.verdicts);
        if (probe.length > 0) {
            await onPhase('work');
            const work = await new DealMovementWorkReader(bitrix).load(
                probe,
                now.getTime() - options.callsLookbackDays * DAY_MS,
                warnings,
            );
            await onPhase('evaluated');
            result = evaluateDealRows({ ...base, work });
        } else {
            await onPhase('evaluated');
        }
        return {
            openTotal: open.rows.length,
            ...result,
            carryOver: carryOver.map(row => String(row.dealId)),
            capped: carryOver.length > 0,
            stagesByHistory: stageNorms.size,
            workProbed: probe.length,
            stageTitles: open.stageTitles,
            progressChecks: dealMovementProgressChecks({
                rows: evaluated,
                transitions: history.transitions,
                historyRead,
                calls: callsByDeal,
                now: base.now,
                checkDays: options.thresholds.agreedStillDays,
            }),
            warnings,
        };
    }
}

/**
 * Потолок ночи: открытых больше — оцениваются самые новые по номеру
 * сделки (решение 17.11.2026), остальные переходят в следующую ночь со
 * своим прошлым статусом.
 */
export function applyCap(
    rows: readonly DealMovementDealRow[],
    maxDeals: number,
): { evaluated: DealMovementDealRow[]; carryOver: DealMovementDealRow[] } {
    const newestFirst = [...rows].sort((a, b) => b.dealId - a.dealId);
    const limit = Math.max(0, Math.floor(maxDeals));
    return {
        evaluated: newestFirst.slice(0, limit),
        carryOver: newestFirst.slice(limit),
    };
}
