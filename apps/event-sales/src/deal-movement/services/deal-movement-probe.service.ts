import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    DEAL_MOVEMENT_PROBE_NOTE_TEXT,
    DEAL_MOVEMENT_REDIS_KEYS,
    type DealMovementProbeJobData,
    type DealMovementProbeResult,
} from '@lib/sales-ai-analytics';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    DEAL_MOVEMENT_PROBE_WAIT_MS,
    DEAL_MOVEMENT_TTL_SEC,
} from '../constants/deal-movement.const';
import { dealMovementPause } from '../lib/deal-movement-pause';
import { concludeDealMovementProbe } from '../lib/deal-movement-probe.report';
import { DealMovementNoteWriter } from './deal-movement-note.writer';
import { DealMovementProbeDealReader } from './deal-movement-probe-deal.reader';

/** Заголовок служебной записи проверки. */
const PROBE_LOG_TITLE = 'Проверка записи в ленту';

/**
 * Проверка записи в ленту на одной сделке (решение 17.11.2026): читает
 * «последнюю активность», пишет служебную запись журнала, через несколько
 * секунд читает снова, пишет комментарий, читает ещё раз; три момента и
 * выводы словами — в Redis. Пишет в живой портал: запускается ТОЛЬКО
 * кнопкой админки, автоматического вызова нет. Сделка — только открытая
 * «ОП Основная» этого портала, иначе отказ без записей.
 *
 * `@Injectable`, но инстанс Битрикса живёт только внутри вызова (CLAUDE.md).
 */
@Injectable()
export class DealMovementProbeService {
    private readonly logger = new Logger(DealMovementProbeService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly redisService: RedisService,
    ) {}

    async run(
        data: DealMovementProbeJobData,
        waitMs: number = DEAL_MOVEMENT_PROBE_WAIT_MS,
    ): Promise<DealMovementProbeResult> {
        const result = startedProbe(data);
        await this.save(result);
        try {
            await this.probe(data, result, waitMs);
        } catch (error) {
            result.phase = 'failed';
            result.error = getErrorString(error);
        }
        result.finishedAt = new Date().toISOString();
        await this.save(result);
        this.logger.log(
            `Движение сделок ${data.domain}: проверка записи в ленту на сделке ${data.dealId} — ${result.phase}`,
        );
        return result;
    }

    private async probe(
        data: DealMovementProbeJobData,
        result: DealMovementProbeResult,
        waitMs: number,
    ): Promise<void> {
        const { bitrix, PortalModel } = await this.pbx.init(data.domain);
        const reader = new DealMovementProbeDealReader(bitrix, PortalModel);
        const deal = await reader.read(data.dealId);
        if (deal.kind === 'refused') {
            result.phase = 'refused';
            result.error = deal.reason;
            return;
        }
        const writer = new DealMovementNoteWriter(bitrix);
        const { moments } = result;
        moments.before = deal.lastActivityAt;

        moments.logMessageAt = new Date().toISOString();
        await writer.writeLogMessage(
            data.dealId,
            PROBE_LOG_TITLE,
            DEAL_MOVEMENT_PROBE_NOTE_TEXT,
        );
        await dealMovementPause(waitMs);
        moments.afterLogMessage = await reader.lastActivityAt(data.dealId);
        await this.save(result);

        moments.commentAt = new Date().toISOString();
        await writer.writeComment(data.dealId, DEAL_MOVEMENT_PROBE_NOTE_TEXT);
        await dealMovementPause(waitMs);
        moments.afterComment = await reader.lastActivityAt(data.dealId);

        Object.assign(result, concludeDealMovementProbe(moments));
        result.phase = 'done';
    }

    private async save(result: DealMovementProbeResult): Promise<void> {
        await this.redisService
            .getClient()
            .set(
                DEAL_MOVEMENT_REDIS_KEYS.probe(result.domain),
                JSON.stringify(result),
                'EX',
                DEAL_MOVEMENT_TTL_SEC.probe,
            );
    }
}

function startedProbe(data: DealMovementProbeJobData): DealMovementProbeResult {
    return {
        domain: data.domain,
        dealId: data.dealId,
        phase: 'running',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        moments: {
            before: null,
            afterLogMessage: null,
            afterComment: null,
            logMessageAt: null,
            commentAt: null,
        },
        logMessageShifts: null,
        commentShifts: null,
        conclusions: [],
        error: null,
    };
}
