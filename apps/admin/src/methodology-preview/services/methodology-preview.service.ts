import { randomUUID } from 'crypto';
import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    MethodologyPreviewStore,
    parseMethodology,
    queuedMethodologyPreview,
    type MethodologyPreviewJobData,
    type MethodologyPreviewState,
} from '@lib/call-lib/call-report/methodology';

/** Проверка разовая: без повторов, следов в очереди не оставляет. */
const PREVIEW_JOB_OPTIONS = {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 10 * 60 * 1000,
} as const;

export interface MethodologyPreviewStartInput {
    domain: string;
    transcriptionId: string;
    config: unknown;
    requestedBy?: string;
}

/**
 * Проверка черновика методики на одном звонке — сторона админки: проверяет
 * конфиг, ставит задание воркеру event-sales (у админки нет расшифровок и
 * конвейера разбора) и отдаёт состояние на опросе. Ничего не сохраняет в
 * таблицу методик.
 */
@Injectable()
export class MethodologyPreviewService {
    constructor(
        private readonly store: MethodologyPreviewStore,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    /** Ставит проверку; конфиг с ошибками до очереди не доходит. */
    async start(
        input: MethodologyPreviewStartInput,
    ): Promise<MethodologyPreviewState> {
        const parsed = parseMethodology(input.config);
        if (!parsed.ok) {
            throw new BadRequestException(
                `Черновик не проходит проверку: ${parsed.errors.join('; ')}`,
            );
        }
        const data: MethodologyPreviewJobData = {
            previewId: randomUUID(),
            domain: input.domain,
            transcriptionId: input.transcriptionId,
            config: input.config,
            ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
        };
        // Состояние пишется до постановки: опрос сразу видит «в очереди».
        const state = await this.store.write(
            queuedMethodologyPreview(data, new Date()),
        );
        await this.queueDispatcher.dispatch(
            QueueNames.CALL_REPORT,
            JobNames.CALL_REPORT_METHODOLOGY_PREVIEW,
            data,
            data.previewId,
            PREVIEW_JOB_OPTIONS,
        );
        return state;
    }

    async status(previewId: string): Promise<MethodologyPreviewState> {
        const state = await this.store.read(previewId);
        if (!state) {
            throw new NotFoundException(
                'Проверка не найдена: результат хранится час. Запустите проверку заново.',
            );
        }
        return state;
    }
}
