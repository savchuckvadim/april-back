import { Injectable } from '@nestjs/common';
import { TranscriptionRepository } from '../repository/transcription.repository';
import {
    buildDedupKey,
    TranscriptionPipelineStateView,
} from '../types/transcription-pipeline.types';

/** Номер дела звонка: положительное целое, иначе звонок пропускается. */
const activityKeyOf = (activityId: number | string): string | null => {
    const id = Number(activityId);
    return Number.isInteger(id) && id > 0 ? String(id) : null;
};

/**
 * Состояние звонков в конвейере разбора по номерам дел Битрикса: одним
 * запросом на список. Звонок, до которого конвейер не дошёл, в ответ не
 * попадает — так список звонков клиента отличает «ещё не разбирался» от
 * «разбирается» и «упал».
 */
@Injectable()
export class TranscriptionCallStateService {
    constructor(private readonly repository: TranscriptionRepository) {}

    /** Состояния по номеру дела звонка; ключ — номер дела строкой. */
    async byActivity(
        domain: string,
        activityIds: readonly (number | string)[],
    ): Promise<Map<string, TranscriptionPipelineStateView>> {
        const states = new Map<string, TranscriptionPipelineStateView>();
        const activityByKey = new Map<string, string>();
        for (const activityId of activityIds) {
            const activity = activityKeyOf(activityId);
            if (activity !== null) {
                activityByKey.set(buildDedupKey(domain, activity), activity);
            }
        }
        if (activityByKey.size === 0) return states;

        const rows = await this.repository.findPipelineStatesByDedupKeys([
            ...activityByKey.keys(),
        ]);
        for (const row of rows) {
            const activityId =
                row.dedup_key === null
                    ? undefined
                    : activityByKey.get(row.dedup_key);
            if (activityId === undefined) continue;
            states.set(activityId, {
                id: row.id.toString(),
                activityId,
                status: row.status,
                callStartedAt: row.call_started_at,
                durationSec: row.duration,
                userId: row.user_id,
                updatedAt: row.updated_at,
            });
        }
        return states;
    }
}
