import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueConcurrencyService } from '@/modules/queue/concurrency/queue-concurrency.service';
import { WsService } from '@/core/ws';
import { EVENT_FLOW_WS_EVENTS } from '../constants/event-flow.const';
import { EnumEventFlowStatus } from '../dto/response/event-flow-operation.dto';
import { EventFlowJobData } from '../dto/event-flow-job.dto';
import { EventFlowStatusService } from '../services/status/event-flow-status.service';
import { EventReportUseCase } from '../use-cases/event-report.use-case';

/**
 * Сколько отчётов выполняется одновременно. Разные клиенты и разные порталы
 * идут параллельно — за это отвечает лок по клиенту ниже.
 */
const FLOW_CONCURRENCY = 4;

/**
 * Одновременных отчётов НА ПОРТАЛ. Меньше общего concurrency намеренно:
 * иначе один портал с очередью отчётов выест всех воркеров, и остальные
 * порталы будут ждать его. Заодно бережёт rate-limit Битрикса.
 */
const MAX_PER_DOMAIN = 2;

/** Пауза перед повторной попыткой занять слот. */
const SLOT_RETRY_DELAY_MS = 3000;

/**
 * Потолок перекладываний (~7,5 мин при 3 с). Клиентский лок живёт 300 с,
 * так что упереться в потолок можно только при аномалии — тогда отчёт
 * честно падает с внятной ошибкой, а не висит в очереди вечно.
 */
const MAX_SLOT_RETRIES = 150;

/**
 * Воркер отправки отчёта менеджера.
 *
 * Здесь и только здесь выполняется batch Битрикса: раньше он крутился прямо в
 * HTTP-запросе, и менеджер ждал его целиком. Теперь контроллер отвечает сразу,
 * а исход доезжает по WS (или поллингом статуса, если сокета нет).
 *
 * Параллелизм: отчёты идут по несколько сразу, но по ОДНОМУ КЛИЕНТУ — строго
 * последовательно (Redis-лок). Без лока два отчёта по одному клиенту оба
 * искали бы «текущую основную сделку» и оба могли её создать — дубль, плюс
 * перемешанные batch-записи полей.
 */
@Injectable()
@Processor(QueueNames.EVENT_SALES_FLOW)
export class EventFlowProcessor {
    private readonly logger = new Logger(EventFlowProcessor.name);

    constructor(
        private readonly ws: WsService,
        private readonly status: EventFlowStatusService,
        private readonly useCase: EventReportUseCase,
        private readonly concurrency: QueueConcurrencyService,
    ) {
        // Как у ColdHooksProcessor: без этой строки в логе нельзя отличить
        // «воркер не поднялся» от «джобов не было» — а разница критичная,
        // в первом случае отчёты молча копятся в очереди.
        this.logger.log(
            `EventFlowProcessor initialized (concurrency=${FLOW_CONCURRENCY}, maxPerDomain=${MAX_PER_DOMAIN})`,
        );
    }

    @Process({ name: JobNames.EVENT_SALES_FLOW, concurrency: FLOW_CONCURRENCY })
    async handle(job: Job<EventFlowJobData>): Promise<void> {
        const { operationId, domain, socketId, dto } = job.data;
        const waitedMs = Date.now() - job.timestamp;
        this.logger.log(
            `EVENT_SALES_FLOW jobId=${job.id} operationId=${operationId} ` +
                `domain=${domain} waitedMs=${waitedMs}`,
        );

        const operation = await this.status.get(domain, operationId);
        if (!operation) {
            // Статус протух или его затёрли — выполнять команду вслепую нельзя:
            // не сможем ни сообщить исход, ни защититься от повтора.
            this.logger.error(
                `operation ${operationId} не найдена в статусах — job отменён`,
            );
            return;
        }

        /*
         * Гейт по СТАТУСУ, а не только по существованию операции (находка
         * ревью): Bull доставляет джоб как минимум один раз — упади воркер
         * ПОСЛЕ выполнения batch'а, stalled-чекер отдаст джоб повторно, и
         * без гейта отчёт прогнался бы в Битрикс второй раз (дубли KPI,
         * истории, элементов смартов). Статус — единственная защита от
         * повторного выполнения, и применять её обязан именно воркер.
         */
        if (operation.status === EnumEventFlowStatus.DONE) {
            this.logger.warn(
                `operation ${operationId} уже выполнена — повторная доставка джоба, batch не выполняется`,
            );
            this.notify(socketId, EVENT_FLOW_WS_EVENTS.DONE, operation);
            return;
        }
        if (operation.status === EnumEventFlowStatus.FAILED) {
            this.logger.warn(
                `operation ${operationId} уже помечена ошибкой — повторная доставка джоба пропущена`,
            );
            return;
        }
        if (operation.status === EnumEventFlowStatus.RUNNING) {
            // Воркер умер посреди выполнения (или stall-гонка). Повторный
            // прогон частично отправленного batch'а — осознанный компромисс
            // at-least-once (так было и до параллелизма); главное — сказать
            // об этом в лог, чтобы дубли в инцидентах были объяснимы.
            this.logger.warn(
                `operation ${operationId} в статусе running — повторный прогон после падения воркера`,
            );
        }

        const slot = await this.concurrency.acquire({
            queue: QueueNames.EVENT_SALES_FLOW,
            domain,
            entityKey: this.entityKey(dto),
            maxPerDomain: MAX_PER_DOMAIN,
        });
        if (!slot.acquired) {
            await this.requeue(job, slot.reason);
            return;
        }

        /*
         * setRunning — УЖЕ внутри try (находка ревью): упади он (Redis/кэш),
         * незакрытый слот навсегда занял бы клиента и место домена, а отчёт
         * молча исчез бы без setFailed.
         */
        let running = operation;
        try {
            running = await this.status.setRunning(
                domain,
                operation,
                new Date().toISOString(),
            );
            const result = await this.useCase.execute(dto, socketId);
            const done = await this.status.setDone(
                domain,
                running,
                result,
                new Date().toISOString(),
            );
            this.notify(socketId, EVENT_FLOW_WS_EVENTS.DONE, done);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const failed = await this.status.setFailed(
                domain,
                running,
                message,
                new Date().toISOString(),
            );
            this.notify(socketId, EVENT_FLOW_WS_EVENTS.ERROR, failed);
            throw error;
        } finally {
            await slot.release();
        }
    }

    /**
     * Ключ сериализации — КЛИЕНТ, а не сущность плейсмента: отчёт из задачи и
     * отчёт из карточки компании трогают одни и те же сделки, и лок обязан
     * поймать оба. Приоритет тот же, что у резолва владельца в init:
     * компания → сделка → лид. Контекста нет (старый клиент) — ключа нет:
     * лучше без сериализации, чем с ложной (два разных клиента под одним
     * ключом ждали бы друг друга).
     */
    private entityKey(dto: EventFlowJobData['dto']): string | null {
        const context = dto?.context;
        if (!context) return null;
        if (context.companyId) return `company:${context.companyId}`;
        if (context.dealId) return `deal:${context.dealId}`;
        if (context.leadId) return `lead:${context.leadId}`;
        return null;
    }

    /**
     * Слот занят — джоб уезжает в конец очереди с задержкой. Именно
     * перекладка, а не ожидание в обработчике: воркер, стоящий на локе,
     * держал бы слот concurrency и не брал чужие отчёты.
     */
    private async requeue(
        job: Job<EventFlowJobData>,
        reason: string | undefined,
    ): Promise<void> {
        const retries = (job.data.slotRetries ?? 0) + 1;
        if (retries > MAX_SLOT_RETRIES) {
            // Отдельная ветка: молчаливое «сдаёмся» оставило бы отчёт
            // навсегда в статусе «в очереди» без единой строки в логе.
            this.logger.error(
                `operation ${job.data.operationId} (${job.data.domain}): слот не освободился за ${MAX_SLOT_RETRIES} попыток (${reason}) — отчёт помечен ошибкой`,
            );
            const operation = await this.status.get(
                job.data.domain,
                job.data.operationId,
            );
            if (operation) {
                await this.status.setFailed(
                    job.data.domain,
                    operation,
                    'Очередь портала перегружена: отчёт не удалось выполнить, повторите отправку',
                    new Date().toISOString(),
                );
            }
            return;
        }

        this.logger.log(
            `operation ${job.data.operationId}: слот занят (${reason}), ` +
                `перекладка #${retries}`,
        );
        await job.queue.add(
            JobNames.EVENT_SALES_FLOW,
            { ...job.data, slotRetries: retries },
            {
                delay: SLOT_RETRY_DELAY_MS,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
    }

    private notify(
        socketId: string | undefined,
        event: string,
        data: unknown,
    ): void {
        if (!socketId) return;
        this.ws.sendToClient(socketId, { event, data });
    }
}
