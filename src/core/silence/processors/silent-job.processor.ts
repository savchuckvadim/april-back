// import { Process, Processor, InjectQueue } from '@nestjs/bull';
// import { Job, Queue } from 'bull';
// import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
// import { SilentJobManagerService } from '@/core/silence/services/silent-job-manager.service';
// import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
// import { SilentJobHandlersRegistry } from '@/core/silence/registry/silent-job-handlers.registry';
// import { HandlerMap } from '../type/silence.type';
// import { getErrorString } from '@/shared';

// /**
//  * Воркер очереди `silent`: один процесс на тип джоба (имя из Bull), внутри — общий конвейер тишины.
//  *
//  * Порядок шагов для каждого Bull-job:
//  * 1) waitUntilSilent — не трогаем _data, пока живёт _lock (после последнего HTTP handle).
//  * 2) collectAndClear — забираем и удаляем _data одним снимком.
//  * 3) registry.getHandler + вызов доменного handler (Bitrix и т.д.).
//  * 4) finally: releaseJobDedupKey — снимаем _job, чтобы следующий HTTP не упирался в dedup после успешного цикла.
//  */
// @Injectable()
// @Processor(QueueNames.SILENT)
// export class SilentJobProcessor implements OnModuleInit {
//     private readonly logger = new Logger(SilentJobProcessor.name);

//     constructor(
//         private readonly silentManager: SilentJobManagerService,
//         private readonly registry: SilentJobHandlersRegistry,
//         @InjectQueue(QueueNames.SILENT) private readonly silentQueue: Queue,
//     ) {
//         this.logger.log('SilentJobProcessor initialized');
//         this.logger.log(`Registry available: ${!!this.registry}`);
//     }

//     onModuleInit(): void {
//         this.silentQueue.on('waiting', (jobId: number | string) => {
//             this.logger.log(
//                 `[silent] QUEUE evt=waiting jobId=${jobId} pid=${process.pid} (в очереди до воркера)`,
//             );
//         });
//         this.silentQueue.on('active', job => {
//             this.logger.log(
//                 `[silent] QUEUE evt=active jobId=${job.id} name=${job.name} pid=${process.pid}`,
//             );
//         });
//         this.silentQueue.on('completed', job => {
//             this.logger.log(
//                 `[silent] QUEUE evt=completed jobId=${job.id} name=${job.name}`,
//             );
//         });
//         this.silentQueue.on('failed', (job, err) => {
//             this.logger.warn(
//                 `[silent] QUEUE evt=failed jobId=${job?.id} name=${job?.name} err=${err?.message}`,
//             );
//         });
//         this.silentQueue.on('stalled', job => {
//             this.logger.warn(
//                 `[silent] QUEUE evt=stalled jobId=${job.id} name=${job.name} — lock/воркер, проверь второй consumer или зависание`,
//             );
//         });
//     }

//     /** `*` — обрабатываем все именованные джобы, которые кладутся в эту очередь (cold-call и др.). */
//     @Process('*')
//     async handle<T extends keyof HandlerMap>(
//         job: Job<{
//             key: string;
//             handlerId: T;
//             payload: HandlerMap[T]['payload'];
//         }>,
//     ) {
//         const { key, handlerId, payload } = job.data;
//         const lockKey = `${key}_lock`;

//         this.logger.log(
//             `[silent] processor START pid=${process.pid} jobId=${job.id} jobName=${job.name} attemptsMade=${job.attemptsMade ?? 'n/a'} handlerId=${String(handlerId)} key=${key} lockKey=${lockKey}`,
//         );

//         try {
//             // Шаг A: ждём естественное окончание окна шума (PX на _lock).
//             this.logger.log(
//                 `[silent] processor jobId=${job.id} → waitUntilSilent ${lockKey}`,
//             );
//             await this.silentManager.waitUntilSilent(lockKey);
//             const snapAfterWait =
//                 await this.silentManager.getSilentRedisFootprint(key);
//             this.logger.log(
//                 `[silent] processor jobId=${job.id} ← waitUntilSilent done | ${snapAfterWait}`,
//             );

//             // Шаг B: забираем накопленное из Redis и очищаем _data.
//             const snapBeforeCollect =
//                 await this.silentManager.getSilentRedisFootprint(key);
//             this.logger.log(
//                 `[silent] processor jobId=${job.id} → collectAndClear ${key} | ${snapBeforeCollect}`,
//             );
//             const collected =
//                 await this.silentManager.collectAndClear<
//                     HandlerMap[T]['collected'][string]
//                 >(key);
//             const n = Object.keys(collected).length;
//             if (n === 0) {
//                 this.logger.warn(
//                     `[silent] processor jobId=${job.id} collectAndClear ПУСТО — use-case не получит сущностей (гонка джобов или данные уже забраны другим jobId)`,
//                 );
//             }
//             this.logger.log(
//                 `[silent] processor jobId=${job.id} ← collectAndClear keys=${n}`,
//             );

//             // Шаг C: резолвим обработчик по handlerId из реестра модулей.
//             const handler = this.registry.getHandler(handlerId);
//             this.logger.log(
//                 `[silent] processor registry handler resolved=${!!handler}`,
//             );

//             if (!handler) {
//                 this.logger.error(
//                     `[silent] processor ABORT no handler for ${String(handlerId)} jobId=${job.id}`,
//                 );
//                 return;
//             }

//             // Шаг D: доменная логика (например cold-hook → Bitrix batch).
//             this.logger.log(
//                 `[silent] processor → user handler jobId=${job.id}`,
//             );
//             await handler(collected as HandlerMap[T]['collected'], payload);
//             this.logger.log(
//                 `[silent] processor ← user handler OK jobId=${job.id} collectedKeys=${Object.keys(collected as object).length}`,
//             );
//         } catch (err) {
//             const errorString = getErrorString(err);
//             this.logger.error(
//                 `[silent] processor FAIL jobId=${job.id} handlerId=${String(handlerId)} key=${key}`,
//                 errorString,
//             );
//             throw err;
//         } finally {
//             const pendingAfterHandler =
//                 await this.silentManager.peekSilentBatchSize(key);
//             const footprintFinally =
//                 await this.silentManager.getSilentRedisFootprint(key);
//             if (pendingAfterHandler > 0) {
//                 this.logger.warn(
//                     `[silent] ORPHAN _data после handler jobId=${job.id} pendingBatch=${pendingAfterHandler} — мерж пришёл во время обработки; ставим follow-up после release | ${footprintFinally}`,
//                 );
//             } else {
//                 this.logger.log(
//                     `[silent] processor jobId=${job.id} finally перед release _job | pendingBatch=${pendingAfterHandler} | ${footprintFinally}`,
//                 );
//             }
//             // Шаг E: всегда снимаем dedup _job — иначе после успешного прогона второй HTTP
//             // увидит «alreadyQueued» до истечения EX=10 и не поставит новый Bull-джоб.
//             await this.silentManager.releaseJobDedupKey(key);
//             await this.silentManager.ensureFollowUpSilentJobIfPending({
//                 key,
//                 handlerId,
//                 payload,
//             });
//         }
//     }
// }
