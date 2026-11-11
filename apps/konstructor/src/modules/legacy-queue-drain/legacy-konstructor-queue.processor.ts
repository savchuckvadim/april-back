import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, JobOptions } from 'bull';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { DEAL_SEND_JOB_OPTIONS } from '../deal-send/lib/deal-send-job.options';

/** Куда переложить задание старой общей очереди 'konstructor'. */
export const LEGACY_KONSTRUCTOR_JOB_ROUTES: Readonly<
    Record<string, { queue: QueueNames; options?: Omit<JobOptions, 'jobId'> }>
> = {
    [JobNames.KONSTRUCTOR_DEAL_SEND]: {
        queue: QueueNames.KONSTRUCTOR_DEAL_SEND,
        options: DEAL_SEND_JOB_OPTIONS,
    },
    [JobNames.OFFER_GENERATE]: { queue: QueueNames.KONSTRUCTOR_OFFER_GENERATE },
    [JobNames.OFFER_GENERATE_MULTI]: {
        queue: QueueNames.KONSTRUCTOR_OFFER_GENERATE_MULTI,
    },
};

/**
 * Дренаж старой общей очереди 'konstructor' на время выкатки разделения.
 *
 * После выкатки новый код ставит задания только в свои очереди, и старую
 * никто не слушает: задания, поставленные старым контейнером в последние
 * секунды, и активные, оборванные остановкой, остались бы в Redis навсегда
 * (проверку зависших Bull запускает только у очереди с процессором). Этот
 * процессор их дочитывает и перекладывает. Подключён только в konstructor.
 *
 * Удалить вместе с QueueNames.KONSTRUCTOR_LEGACY через неделю после выкатки.
 */
@Processor(QueueNames.KONSTRUCTOR_LEGACY)
export class LegacyKonstructorQueueProcessor {
    private readonly logger = new Logger(LegacyKonstructorQueueProcessor.name);

    constructor(private readonly dispatcher: QueueDispatcherService) {}

    @Process('*')
    async forward(job: Job): Promise<{ queue: QueueNames; jobId: string }> {
        const jobName = job.name as JobNames;
        const route = LEGACY_KONSTRUCTOR_JOB_ROUTES[jobName];
        if (!route) {
            throw new Error(
                `Задание «${job.name}» из старой очереди konstructor некуда переложить`,
            );
        }
        // у записи сделки jobId числовой из счётчика старой очереди — с
        // префиксом, чтобы не пересечься с UUID новых заданий
        const jobId =
            jobName === JobNames.KONSTRUCTOR_DEAL_SEND
                ? `legacy-${String(job.id)}`
                : String(job.id);
        await this.dispatcher.dispatch(
            route.queue,
            jobName,
            job.data,
            jobId,
            route.options,
        );
        this.logger.warn(
            `Старая очередь konstructor: «${job.name}» (${String(job.id)}) переложено в ${route.queue}`,
        );
        return { queue: route.queue, jobId };
    }
}
