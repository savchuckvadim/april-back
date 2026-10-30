/**
 * Запись-статус прогона дописывания полей карточек (ais, тип
 * `call-report-smart-backfill-run`, ключ `${mode}:${from}..${to}`,
 * обновляется в месте). Читают админ-ручки `admin/ai-analytics/
 * smart-backfill-status` и панель запуска.
 *
 * `@Injectable` без bitrix-состояния: только AiService.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { AiService, pickActiveRecord } from '@lib/call-lib';
import {
    CALL_REPORT_SMART_BACKFILL_RUN_TYPE,
    isSmartBackfillRunStatusLike,
    SMART_BACKFILL_DEFAULTS,
    smartBackfillRunKey,
    type SmartBackfillMode,
    type SmartBackfillRunStatus,
} from '@lib/sales-ai-analytics';

/** provider записей статуса — чтобы отличать от снапшотов витрины. */
export const SMART_BACKFILL_PROVIDER = 'call-report-smart-backfill';

/** Статус прогона с id его записи ais. */
export interface SmartBackfillStatusRecord {
    id: string;
    status: SmartBackfillRunStatus;
}

@Injectable()
export class CallReportSmartBackfillStatusService {
    constructor(private readonly aiService: AiService) {}

    /** Активная запись статуса ключа; нет или чужая форма — null. */
    async load(
        domain: string,
        mode: SmartBackfillMode,
        from: string,
        to: string,
    ): Promise<SmartBackfillStatusRecord | null> {
        const records = await this.aiService.findByDomainTypeKeys(
            domain,
            CALL_REPORT_SMART_BACKFILL_RUN_TYPE,
            { activityIds: [smartBackfillRunKey(mode, from, to)] },
        );
        const record = pickActiveRecord(records);
        if (
            record === null ||
            !isSmartBackfillRunStatusLike(record.user_result)
        ) {
            return null;
        }
        return { id: record.id, status: record.user_result };
    }

    /** Создать запись статуса или обновить существующую в месте; возвращает id. */
    async save(
        status: SmartBackfillRunStatus,
        existingId: string | null,
    ): Promise<string> {
        const payload = JSON.parse(JSON.stringify(status)) as Prisma.JsonValue;
        if (existingId !== null) {
            await this.aiService.update(existingId, { user_result: payload });
            return existingId;
        }
        const created = await this.aiService.create({
            provider: SMART_BACKFILL_PROVIDER,
            app: SMART_BACKFILL_DEFAULTS.app,
            model: SMART_BACKFILL_DEFAULTS.calcVersion,
            type: CALL_REPORT_SMART_BACKFILL_RUN_TYPE,
            status: 'done',
            activity_id: smartBackfillRunKey(
                status.mode,
                status.from,
                status.to,
            ),
            domain: status.domain,
            user_result: payload,
        });
        return String(created.id);
    }
}
