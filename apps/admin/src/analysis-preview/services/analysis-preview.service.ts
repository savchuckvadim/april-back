import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    AnalysisPreviewStore,
    queuedAnalysisPreview,
    type AnalysisPreviewJobData,
    type AnalysisPreviewState,
} from '@lib/call-lib/call-report/analysis-preview';

/** Проверка разовая: без повторов, следов в очереди не оставляет. */
const PREVIEW_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 15 * 60 * 1000,
} as const;

export interface AnalysisPreviewStartInput {
    domain: string;
    transcriptionId: string;
    requestedBy?: string;
}

/**
 * Проверка разбора на одном звонке — сторона админки: ставит задание
 * воркеру event-sales (у админки нет расшифровок и конвейера разбора) и
 * отдаёт состояние на опросе. Ничего не сохраняет.
 */
@Injectable()
export class AnalysisPreviewService {
    constructor(
        private readonly store: AnalysisPreviewStore,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async start(
        input: AnalysisPreviewStartInput,
    ): Promise<AnalysisPreviewState> {
        const data: AnalysisPreviewJobData = {
            previewId: randomUUID(),
            domain: input.domain,
            transcriptionId: input.transcriptionId,
            ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
        };
        // Состояние пишется до постановки: опрос сразу видит «в очереди».
        const state = await this.store.write(
            queuedAnalysisPreview(data, new Date()),
        );
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_ANALYSIS_PREVIEW,
            data,
            data.previewId,
            PREVIEW_JOB_OPTIONS,
        );
        return state;
    }

    async status(previewId: string): Promise<AnalysisPreviewState> {
        const state = await this.store.read(previewId);
        if (!state) {
            throw new NotFoundException(
                'Проверка не найдена: результат хранится час. Запустите проверку заново.',
            );
        }
        return state;
    }
}
