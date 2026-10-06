import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { EnumEventFlowStatus } from '../../dto/response/event-flow-operation.dto';
import {
    EVENT_FLOW_SUBJECT_CLAIM_TTL_SECONDS,
    EVENT_FLOW_SUBJECT_DONE_TTL_SECONDS,
} from '../../constants/event-flow.const';
import { EventFlowStatusService } from '../status/event-flow-status.service';
import {
    EventFlowSubject,
    duplicateReportMessage,
    eventFlowSubjectOf,
} from './event-flow-subject';

/** Продлить замок, только если он всё ещё наш. */
const EXPIRE_IF_OWNER =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
    "return redis.call('EXPIRE', KEYS[1], ARGV[2]) end return 0";

/** Снять замок, только если он всё ещё наш. */
const DELETE_IF_OWNER =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
    "return redis.call('DEL', KEYS[1]) end return 0";

export const EVENT_FLOW_SETTLE = {
    done: 'done',
    failed: 'failed',
} as const;

export type EventFlowSettle =
    (typeof EVENT_FLOW_SETTLE)[keyof typeof EVENT_FLOW_SETTLE];

/**
 * Гард повторной отправки отчёта: второй отчёт по тому же предмету (дело,
 * итог по сделке — см. {@link eventFlowSubjectOf}), пока первый в очереди,
 * выполняется или выполнен минуты назад, получает 409 с понятным текстом.
 *
 * Замок — ключ Redis со значением «номер операции»: ставится при приёме
 * отчёта, после выполнения живёт ещё 10 минут, после ошибки снимается —
 * упавший отчёт можно отправить заново. Redis недоступен — отчёт НЕ
 * блокируем: потерянный отчёт хуже возможного дубля.
 */
@Injectable()
export class EventFlowDuplicateGuardService {
    private readonly logger = new Logger(EventFlowDuplicateGuardService.name);

    constructor(
        private readonly redis: RedisService,
        private readonly status: EventFlowStatusService,
    ) {}

    /** Занять предмет отчёта за операцией или отказать (409). */
    async claim(dto: EventSalesFlowDto, operationId: string): Promise<void> {
        const subject = eventFlowSubjectOf(dto);
        if (!subject) return;
        const key = this.key(dto.domain, subject);

        let holderId: string | null;
        try {
            holderId = await this.tryClaim(key, operationId);
        } catch (error) {
            this.logger.warn(
                `flow-duplicate: замок ${key} не проверен — отчёт принимаем ` +
                    `без него (${String(error)})`,
            );
            return;
        }
        if (!holderId) return;

        const holder = await this.status.get(dto.domain, holderId);
        if (holder && holder.status !== EnumEventFlowStatus.FAILED) {
            this.logger.warn(
                `flow-duplicate: ${dto.domain} ${subject.key} — уже есть ` +
                    `операция ${holderId} (${holder.status}), ${operationId} отклонена`,
            );
            throw new ConflictException(
                duplicateReportMessage(subject, holder, new Date()),
            );
        }

        // Прошлый отчёт упал (или его статус уже не найти) — предмет свободен.
        try {
            await this.redis
                .getClient()
                .set(
                    key,
                    operationId,
                    'EX',
                    EVENT_FLOW_SUBJECT_CLAIM_TTL_SECONDS,
                );
        } catch (error) {
            this.logger.warn(
                `flow-duplicate: замок ${key} не перезаписан (${String(error)})`,
            );
        }
    }

    /**
     * Отчёт закончился: выполнен — замок живёт ещё 10 минут, упал — снят.
     * Ошибки замка отчёт не роняют.
     */
    async settle(
        dto: EventSalesFlowDto,
        operationId: string,
        outcome: EventFlowSettle,
    ): Promise<void> {
        const subject = eventFlowSubjectOf(dto);
        if (!subject) return;
        const key = this.key(dto.domain, subject);
        try {
            const client = this.redis.getClient();
            if (outcome === EVENT_FLOW_SETTLE.done) {
                await client.eval(
                    EXPIRE_IF_OWNER,
                    1,
                    key,
                    operationId,
                    String(EVENT_FLOW_SUBJECT_DONE_TTL_SECONDS),
                );
            } else {
                await client.eval(DELETE_IF_OWNER, 1, key, operationId);
            }
        } catch (error) {
            this.logger.warn(
                `flow-duplicate: замок ${key} не обновлён (${String(error)})`,
            );
        }
    }

    /** null — замок наш; иначе номер операции, которая его держит. */
    private async tryClaim(
        key: string,
        operationId: string,
    ): Promise<string | null> {
        const client = this.redis.getClient();
        const set = await client.set(
            key,
            operationId,
            'EX',
            EVENT_FLOW_SUBJECT_CLAIM_TTL_SECONDS,
            'NX',
        );
        if (set) return null;
        const holder = await client.get(key);
        return holder && holder !== operationId ? holder : null;
    }

    private key(domain: string, subject: EventFlowSubject): string {
        return `event-sales-flow:subject:${domain}:${subject.key}`;
    }
}
