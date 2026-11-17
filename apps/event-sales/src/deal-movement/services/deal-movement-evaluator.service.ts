import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import {
    dealMovementVerdict,
    type DealMovementNightDeal,
    type DealMovementRunPhase,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import {
    buildDealMovementDossier,
    needsHistory,
    toNightDeal,
} from '../lib/deal-movement-dossier.mapper';
import { indexOpenDeals } from '../lib/deal-movement-calls.link';
import type {
    DealMovementDealRow,
    DealMovementOptions,
} from '../types/deal-movement.types';
import { DealMovementCallsLoader } from './deal-movement-calls.loader';
import { DealMovementDealsReader } from './deal-movement-deals.reader';
import { DealMovementHistoryReader } from './deal-movement-history.reader';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Итог оценки портала: вердикты ночи и то, что попало под потолок. */
export interface DealMovementEvaluation {
    readonly openTotal: number;
    readonly deals: DealMovementNightDeal[];
    readonly verdicts: Map<string, DealMovementVerdict>;
    /** Открытые сделки сверх потолка: их прошлое состояние сохраняется. */
    readonly carryOver: string[];
    readonly capped: boolean;
    readonly warnings: string[];
}

/**
 * Оценка открытых сделок портала: досье собирает код, статус — чистые
 * правила библиотеки. Читает из Битрикса только сделки (целиком) и историю
 * стадий сдвинутых за окно; звонки — из нашей БД. Ничего не пишет.
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
        const transitions = await new DealMovementHistoryReader(
            bitrix,
            open.categoryId,
            open.stages,
        ).load(
            evaluated
                .filter(row => needsHistory(row, windowStartMs))
                .map(row => row.dealId),
            warnings,
        );

        await onPhase('calls');
        const callsByDeal = await this.calls.load(
            domain,
            new Date(now.getTime() - options.callsLookbackDays * DAY_MS),
            now,
            // Индекс по ВСЕМ открытым: «у компании одна открытая сделка»
            // считается по воронке целиком, а не по оценённой части.
            indexOpenDeals(open.rows),
        );

        await onPhase('evaluated');
        const nowIso = now.toISOString();
        const deals: DealMovementNightDeal[] = [];
        const verdicts = new Map<string, DealMovementVerdict>();
        for (const row of evaluated) {
            const verdict = dealMovementVerdict(
                buildDealMovementDossier(
                    row,
                    transitions.get(row.dealId) ?? [],
                    callsByDeal.get(row.dealId) ?? [],
                ),
                nowIso,
                options.thresholds,
            );
            verdicts.set(verdict.dealId, verdict);
            deals.push(toNightDeal(row, verdict));
        }
        return {
            openTotal: open.rows.length,
            deals,
            verdicts,
            carryOver: carryOver.map(row => String(row.dealId)),
            capped: carryOver.length > 0,
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
