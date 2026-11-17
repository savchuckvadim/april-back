import { Injectable } from '@nestjs/common';
import {
    activeAnalysisByTranscription,
    AGENT_ANALYSIS_TYPE,
    AiService,
    TranscriptionStoreService,
    type TranscriptionPipelineLiteView,
} from '@lib/call-lib';
import type { DealMovementCall } from '@lib/sales-ai-analytics';
import { DEAL_MOVEMENT_CALLS_CHUNK } from '../constants/deal-movement.const';
import { toDealMovementCallRef } from '../lib/deal-movement-call-ref';
import {
    linkCallsToDeals,
    mayBelongToDeals,
    type DealMovementDealIndex,
} from '../lib/deal-movement-calls.link';
import { toPositiveId } from '../lib/deal-movement-deal-row';
import type { DealMovementCallRef } from '../types/deal-movement.types';

/**
 * Разобранные звонки по открытым сделкам — ТОЛЬКО из нашей БД, без
 * обращений к Битриксу.
 *
 * Порядок: готовые расшифровки окна без текста → только те, что могут
 * относиться к открытым сделкам (по связям) → действующие разборы порциями
 * по 100 расшифровок (существующими методами, без сырого SQL) → проекция
 * сразу: полные записи разбора в памяти не держатся (решение 17.11.2026)
 * → сцепка со сделками пятью путями.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementCallsLoader {
    constructor(
        private readonly transcriptions: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async load(
        domain: string,
        from: Date,
        to: Date,
        index: DealMovementDealIndex,
    ): Promise<Map<number, DealMovementCall[]>> {
        const rows = (
            await this.transcriptions.findDoneInPeriodLite(domain, from, to)
        ).filter(row =>
            mayBelongToDeals(
                row.entityType ? row.entityType.trim().toLowerCase() : null,
                toPositiveId(row.entityId),
                index,
            ),
        );
        const refs: DealMovementCallRef[] = [];
        for (
            let start = 0;
            start < rows.length;
            start += DEAL_MOVEMENT_CALLS_CHUNK
        ) {
            refs.push(
                ...(await this.refsOf(
                    domain,
                    rows.slice(start, start + DEAL_MOVEMENT_CALLS_CHUNK),
                )),
            );
        }
        return linkCallsToDeals(refs, index);
    }

    /** Порция расшифровок → звонки с действующим разбором. */
    private async refsOf(
        domain: string,
        rows: readonly TranscriptionPipelineLiteView[],
    ): Promise<DealMovementCallRef[]> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            AGENT_ANALYSIS_TYPE,
            { transcriptionIds: rows.map(row => row.id) },
        );
        const active = activeAnalysisByTranscription(records);
        const refs: DealMovementCallRef[] = [];
        for (const row of rows) {
            const record = active.get(row.id);
            if (!record) continue;
            const ref = toDealMovementCallRef(row, record.user_result);
            if (ref !== null) refs.push(ref);
        }
        return refs;
    }
}
