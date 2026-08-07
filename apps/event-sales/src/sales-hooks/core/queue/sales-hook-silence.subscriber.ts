import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
    EventSilentJobManagerHandler,
    SILENCE_EVENT_PREFIX,
} from '@lib/core/event-silence';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { SalesHookDispatchService } from '../services/sales-hook-dispatch.service';
import { SalesHookIdempotencyService } from '../services/sales-hook-idempotency.service';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import {
    EnumSalesHookSource,
    SalesHookRobotEnvelope,
} from '../contracts/sales-hook-job.type';

/**
 * Мост silence → очередь операций: после окна тишины пачка конвертов
 * превращается в одну операцию хука. Подписчик намеренно тонкий — вся
 * работа (pbx.init, батчи) идёт в воркере EVENT_SALES_HOOK_OPS, чтобы не
 * блокировать однопоточный воркер event-silent.
 *
 * `{ async: true }` обязателен: silence-менеджер ждёт listener'ов через
 * emitAsync (см. EVENT_SILENCE_GUIDE.md).
 */
@Injectable()
export class SalesHookSilenceSubscriber {
    private readonly logger = new Logger(SalesHookSilenceSubscriber.name);

    constructor(
        private readonly dispatch: SalesHookDispatchService,
        private readonly idempotency: SalesHookIdempotencyService,
    ) {}

    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.SALES_HOOK_LEAD_TO_WORK}`, {
        async: true,
    })
    onLeadToWork(event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>) {
        return this.acceptBatch(EnumSalesHookCode.LEAD_TO_WORK, event);
    }

    @OnEvent(
        `${SILENCE_EVENT_PREFIX}:${JobNames.SALES_HOOK_MERGE_DUPLICATES}`,
        { async: true },
    )
    onMergeDuplicates(
        event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>,
    ) {
        return this.acceptBatch(EnumSalesHookCode.MERGE_DUPLICATES, event);
    }

    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.SALES_HOOK_TRANSFER_WORK}`, {
        async: true,
    })
    onTransferWork(
        event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>,
    ) {
        return this.acceptBatch(EnumSalesHookCode.TRANSFER_WORK, event);
    }

    @OnEvent(`${SILENCE_EVENT_PREFIX}:${JobNames.SALES_HOOK_REJECT_BUFFER}`, {
        async: true,
    })
    onRejectBuffer(
        event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>,
    ) {
        return this.acceptBatch(EnumSalesHookCode.REJECT_BUFFER, event);
    }

    @OnEvent(
        `${SILENCE_EVENT_PREFIX}:${JobNames.SALES_HOOK_CONVERT_NORMALIZER}`,
        { async: true },
    )
    onConvertNormalizer(
        event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>,
    ) {
        return this.acceptBatch(EnumSalesHookCode.CONVERT_NORMALIZER, event);
    }

    private async acceptBatch(
        hook: EnumSalesHookCode,
        event: EventSilentJobManagerHandler<SalesHookRobotEnvelope>,
    ): Promise<void> {
        const domain = event.payload.domain;
        const envelopes = Object.values(event.collected);
        if (envelopes.length === 0) return;

        const operation = await this.dispatch.accept(
            hook,
            domain,
            EnumSalesHookSource.ROBOT,
            envelopes.map(envelope => ({
                entityKey: envelope.entityKey,
                fingerprint: this.idempotency.fingerprint(
                    hook,
                    envelope.entityKey,
                    { data: envelope.data },
                ),
                data: envelope.data,
            })),
        );

        this.logger.log(
            operation
                ? `sales-hook ${hook}: пачка из ${envelopes.length} → операция ${operation.operationId}`
                : `sales-hook ${hook}: пачка из ${envelopes.length} отброшена как повтор`,
        );
    }
}
