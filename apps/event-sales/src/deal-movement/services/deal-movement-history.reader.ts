import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import type {
    IBXStageHistoryItem,
    IBXStageHistoryListRequest,
} from '@lib/bitrix/domain/crm/stage-history';
import type { DealMovementTransition } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_HISTORY } from '../constants/deal-movement.const';
import {
    historyPointsByDeal,
    stageDwellDays,
    toHistoryPoints,
    transitionsByDeal,
} from '../lib/deal-movement-transitions';
import type { SalesBaseStageLookup } from '../lib/deal-movement-stages';

/** Предел элементов на страницу списочных методов REST. */
const PAGE_SIZE = 50;

/** Прочитанная история: переходы по сделкам и дни закрытых эпизодов. */
export interface DealMovementHistory {
    readonly transitions: Map<number, DealMovementTransition[]>;
    /**
     * Ступень → дни закрытых эпизодов (вход для срока стадии по истории
     * портала, 20.11.2026 — без лишних обращений к Битриксу).
     */
    readonly dwell: Map<number, number[]>;
}

/** Порция сделок одной команды и её курсор `>ID`. */
interface HistoryChunk {
    readonly cmd: string;
    readonly dealIds: number[];
    lastId?: number;
    done: boolean;
}

type BatchChunk = { result?: Record<string, unknown> };

const itemsOf = (
    responses: readonly BatchChunk[],
    cmd: string,
): IBXStageHistoryItem[] => {
    for (const response of responses) {
        const value = response?.result?.[cmd] as
            | { items?: IBXStageHistoryItem[] }
            | undefined;
        if (Array.isArray(value?.items)) return value.items;
    }
    return [];
};

/**
 * История стадий выбранных сделок — полная, без окна по дате: откату нужна
 * ступень, на которой сделка стояла к началу окна, а она может быть
 * сколь угодно давней. Сделки берутся только те, что сдвигались за окно
 * (`needsHistory`), поэтому объём мал. Из той же истории — дни закрытых
 * эпизодов стадий: срок стадии по истории портала.
 *
 * Пачка: команда на 50 сделок (`OWNER_ID` списком), раунд — по странице
 * на каждую незакрытую порцию, курсор `>ID` + `start: -1`. Команды копятся
 * и отправляются ОДНИМ инстансом (`callBatchWithConcurrency(1, strict)`):
 * упавшая пачка — исключение, а не тихо неполная история
 * (ai/rules/heavy-endpoint-queue.md, bitrix-batch-grouping.md: зависимостей
 * `$result` нет, буфер не нужен, ключи команд уникальны в раунде).
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 */
export class DealMovementHistoryReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly categoryId: number,
        private readonly stages: SalesBaseStageLookup,
    ) {}

    async load(
        dealIds: readonly number[],
        warnings: string[],
    ): Promise<DealMovementHistory> {
        const chunks = this.chunksOf(dealIds);
        const items: IBXStageHistoryItem[] = [];
        for (let round = 0; round < DEAL_MOVEMENT_HISTORY.maxRounds; round++) {
            const active = chunks.filter(chunk => !chunk.done);
            if (active.length === 0) break;
            for (const chunk of active) {
                this.bitrix.batch.stageHistory.list(
                    chunk.cmd,
                    this.pageRequest(chunk),
                );
            }
            const responses = (await this.bitrix.api.callBatchWithConcurrency(
                1,
                { strict: true },
            )) as BatchChunk[];
            for (const chunk of active) {
                const page = itemsOf(responses, chunk.cmd);
                items.push(...page);
                advance(chunk, page);
            }
        }
        const unfinished = chunks.filter(chunk => !chunk.done).length;
        if (unfinished > 0) {
            warnings.push(
                `история стадий дочитана не у всех сделок (порций: ${unfinished}) — откат у них мог не посчитаться`,
            );
        }
        const byDeal = historyPointsByDeal(toHistoryPoints(items, this.stages));
        return {
            transitions: transitionsByDeal(byDeal),
            dwell: stageDwellDays(byDeal),
        };
    }

    private chunksOf(dealIds: readonly number[]): HistoryChunk[] {
        const chunks: HistoryChunk[] = [];
        const size = DEAL_MOVEMENT_HISTORY.dealsPerCommand;
        for (let start = 0; start < dealIds.length; start += size) {
            chunks.push({
                cmd: `movement_history_${chunks.length}`,
                dealIds: dealIds.slice(start, start + size),
                done: false,
            });
        }
        return chunks;
    }

    private pageRequest(chunk: HistoryChunk): IBXStageHistoryListRequest {
        return {
            entityTypeId: BitrixOwnerTypeId.DEAL,
            filter: {
                CATEGORY_ID: this.categoryId,
                OWNER_ID: chunk.dealIds,
                ...(chunk.lastId === undefined ? {} : { '>ID': chunk.lastId }),
            },
            order: { ID: 'ASC' },
            select: ['ID', 'OWNER_ID', 'CREATED_TIME', 'STAGE_ID'],
            start: -1,
        };
    }
}

/**
 * Сдвиг курсора порции: неполная страница закрывает её; полная без роста
 * ID — тоже (иначе бесконечный цикл).
 */
function advance(
    chunk: HistoryChunk,
    items: readonly IBXStageHistoryItem[],
): void {
    let lastId: number | undefined;
    for (const item of items) {
        const id = Number(item.ID);
        if (Number.isFinite(id)) lastId = Math.max(lastId ?? id, id);
    }
    const moved = lastId !== undefined && lastId !== chunk.lastId;
    if (moved) chunk.lastId = lastId;
    chunk.done = items.length < PAGE_SIZE || !moved;
}
