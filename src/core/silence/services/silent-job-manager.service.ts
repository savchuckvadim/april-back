// // core/silence/silent-job-manager.service.ts
// //
// // Поток «тишины» (debounce через Redis + Bull):
// // 1) HTTP вызывает handle(keyPrefix, …) — мержит событие в _data, продлевает _lock (окно шума).
// // 2) Если никто не взял слот SET NX на _job — ставим Bull-джобу (атомарно, без гонки GET+SET).
// // 3) Воркер ждёт исчезновения _lock (waitUntilSilent), забирает и удаляет _data (collectAndClear), зовёт handler.
// // 4) После завершения воркера processor снимает _job (releaseJobDedupKey), чтобы следующий HTTP сразу мог снова поставить джоб,
// //    иначе _job жил бы только по EX=10 и блокировал бы повторный dispatch.

// import { InjectQueue } from '@nestjs/bull';
// import { Injectable, Logger } from '@nestjs/common';
// import type { Redis } from 'ioredis';
// import { Queue } from 'bull';
// import { RedisService } from '../../redis/redis.service';
// import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
// import { QueueNames } from 'src/modules/queue/constants/queue-names.enum';
// import { SilentJobHandlerId } from '@/core/silence/constants/silent-job-handlers.enum';
// import { HandlerMap } from '../type/silence.type';
// import { getErrorString } from '@/shared';

// @Injectable()
// export class SilentJobManagerService {
//     private readonly logger = new Logger(SilentJobManagerService.name);

//     constructor(
//         private readonly redisService: RedisService,
//         private readonly queueDispatcher: QueueDispatcherService,
//         @InjectQueue(QueueNames.SILENT) private readonly silentQueue: Queue,
//     ) {
//         this.logger.log('SilentJobManagerService initialized');
//     }

//     /**
//      * Отложенные снимки Bull по jobId: видно, ушла ли джоба в active/completed на этом процессе
//      * или «зависла» в waiting (часто — другой consumer на том же Redis).
//      */
//     private scheduleSilentBullJobStateSnapshots(
//         bullJobId: string | number | undefined,
//         mergeId: string,
//     ): void {
//         if (bullJobId === undefined || bullJobId === null) {
//             return;
//         }
//         const delaysMs = [400, 1200, 3000];
//         for (const afterMs of delaysMs) {
//             setTimeout(() => {
//                 void this.logSilentBullJobStateSnapshot(
//                     bullJobId,
//                     afterMs,
//                     mergeId,
//                 );
//             }, afterMs);
//         }
//     }

//     private async logSilentBullJobStateSnapshot(
//         bullJobId: string | number,
//         afterMs: number,
//         mergeId: string,
//     ): Promise<void> {
//         try {
//             const job = await this.silentQueue.getJob(String(bullJobId));
//             if (!job) {
//                 this.logger.warn(
//                     `[silent] bull snapshot ~${afterMs}ms mergeId=${mergeId} jobId=${bullJobId} → getJob=null (удалена/другой префикс Redis?)`,
//                 );
//                 return;
//             }
//             const state = await job.getState();
//             const counts = await this.silentQueue.getJobCounts();
//             this.logger.log(
//                 `[silent] bull snapshot ~${afterMs}ms mergeId=${mergeId} jobId=${bullJobId} state=${state} name=${job.name} attemptsMade=${job.attemptsMade ?? 'n/a'} processedOn=${job.processedOn ?? 'n/a'} finishedOn=${job.finishedOn ?? 'n/a'} failedReason=${job.failedReason ?? 'n/a'} pid=${process.pid} counts=${JSON.stringify(counts)}`,
//             );
//         } catch (err) {
//             this.logger.warn(
//                 `[silent] bull snapshot ~${afterMs}ms mergeId=${mergeId} jobId=${bullJobId} FAILED`,
//                 getErrorString(err),
//             );
//         }
//     }

//     /** Разбор JSON из Redis в Record; мусор / не объект → пустой объект. */
//     private parseJsonRecord<T>(raw: string): Record<string, T> {
//         const parsed: unknown = JSON.parse(raw);
//         if (typeof parsed !== 'object' || parsed === null) {
//             return {};
//         }
//         return parsed as Record<string, T>;
//     }

//     /** Лёгкий снимок ключей тишины без парсинга JSON (для poll / hot path). */
//     private async silentRedisMetaLine(
//         redis: Redis,
//         keyPrefix: string,
//     ): Promise<string> {
//         const dk = `${keyPrefix}_data`;
//         const lk = `${keyPrefix}_lock`;
//         const jk = `${keyPrefix}_job`;
//         const [dataEx, lockPttl, jobTtl, dataStrlen] = await Promise.all([
//             redis.exists(dk),
//             redis.pttl(lk),
//             redis.ttl(jk),
//             redis.strlen(dk),
//         ]);
//         return `dataEx=${dataEx} dataStrlen=${dataStrlen} lockPTTLms=${lockPttl} jobTTLs=${jobTtl}`;
//     }

//     /**
//      * Полный снимок: мета + число записей в JSON _data (дороже, только для отладки).
//      */
//     private async buildSilentRedisDebugLine(
//         redis: Redis,
//         keyPrefix: string,
//     ): Promise<string> {
//         const meta = await this.silentRedisMetaLine(redis, keyPrefix);
//         const dk = `${keyPrefix}_data`;
//         const raw = await redis.get(dk);
//         let entries = 0;
//         let parseErr = false;
//         if (raw) {
//             try {
//                 const parsed: unknown = JSON.parse(raw);
//                 entries =
//                     typeof parsed === 'object' &&
//                     parsed !== null &&
//                     !Array.isArray(parsed)
//                         ? Object.keys(parsed).length
//                         : -1;
//             } catch {
//                 parseErr = true;
//             }
//         }
//         return `${meta} dataEntries=${parseErr ? 'JSON_ERR' : entries}`;
//     }

//     /** Снимок Redis для логов из воркера / HTTP без проброса клиента наружу. */
//     async getSilentRedisFootprint(keyPrefix: string): Promise<string> {
//         return this.buildSilentRedisDebugLine(
//             this.redisService.getClient(),
//             keyPrefix,
//         );
//     }

//     /** Сколько сущностей сейчас в _data (после collect обычно 0). */
//     async peekSilentBatchSize(keyPrefix: string): Promise<number> {
//         const raw = await this.redisService
//             .getClient()
//             .get(`${keyPrefix}_data`);
//         if (!raw) {
//             return 0;
//         }
//         try {
//             const parsed: unknown = JSON.parse(raw);
//             if (
//                 typeof parsed === 'object' &&
//                 parsed !== null &&
//                 !Array.isArray(parsed)
//             ) {
//                 return Object.keys(parsed).length;
//             }
//             return -1;
//         } catch {
//             return -2;
//         }
//     }

//     /**
//      * Если после воркера в Redis снова есть _data (мерж во время handler), ставим ещё одну джобу.
//      * SET NX на _job — без гонки с параллельным HTTP.
//      */
//     async ensureFollowUpSilentJobIfPending(dispatchData: {
//         key: string;
//         handlerId: SilentJobHandlerId;
//         payload: unknown;
//     }): Promise<void> {
//         const keyPrefix = dispatchData.key;
//         const pending = await this.peekSilentBatchSize(keyPrefix);
//         if (pending <= 0) {
//             return;
//         }
//         const redis = this.redisService.getClient();
//         const jobKey = `${keyPrefix}_job`;
//         const acquired = await redis.set(jobKey, '1', 'EX', 10, 'NX');
//         if (acquired !== 'OK') {
//             this.logger.log(
//                 `[silent] follow-up: NX не взяли jobKey=${jobKey} pending=${pending} (ставит другой поток)`,
//             );
//             return;
//         }
//         try {
//             const bullJob = await this.queueDispatcher.dispatch(
//                 QueueNames.SILENT,
//                 dispatchData.handlerId,
//                 dispatchData,
//             );
//             this.logger.warn(
//                 `[silent] FOLLOW-UP dispatch ok bullJobId=${bullJob.id} pending=${pending} handlerId=${String(dispatchData.handlerId)}`,
//             );
//             this.scheduleSilentBullJobStateSnapshots(
//                 bullJob.id,
//                 `follow-up_${dispatchData.handlerId}`,
//             );
//         } catch (err) {
//             await redis.del(jobKey);
//             throw err;
//         }
//     }

//     /**
//      * Шаг HTTP: накопить событие и при необходимости поставить Bull-джоб.
//      *
//      * Redis-ключи (все с общим keyPrefix):
//      * - `{prefix}_data` — JSON map id → payload; каждый вызов handle дописывает/мержит.
//      * - `{prefix}_lock` — «сейчас идёт шум»; PX = ttlMs, каждый handle продлевает окно тишины.
//      * - `{prefix}_job` — «уже отправили джоб в Bull»; при первом dispatch ставим EX=10 (антиспам в очередь).
//      * - `{prefix}_counter` — служебный счётчик (INCR + EXPIRE), не чистится collectAndClear.
//      */
//     async handle<T extends keyof HandlerMap>(
//         keyPrefix: string,
//         ttlMs: number,
//         data: HandlerMap[T]['collected'][string],
//         jobName: SilentJobHandlerId,
//         jobPayload: HandlerMap[T]['payload'],
//     ) {
//         const mergeId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
//         this.logger.log(
//             `[silent] handle enter mergeId=${mergeId} jobName=${jobName} keyPrefix=${keyPrefix} ttlMs=${ttlMs}`,
//         );
//         const redis = this.redisService.getClient();

//         const key = `${keyPrefix}_data`;
//         const lockKey = `${keyPrefix}_lock`;
//         const jobKey = `${keyPrefix}_job`;

//         const beforeMeta = await this.silentRedisMetaLine(redis, keyPrefix);
//         this.logger.log(
//             `[silent] handle mergeId=${mergeId} BEFORE_WRITE ${beforeMeta}`,
//         );

//         // 1) Считываем уже накопленные по этому prefix события (если есть).
//         const existingRaw = await redis.get(key);
//         const current = existingRaw
//             ? this.parseJsonRecord<HandlerMap[T]['collected'][string]>(
//                   existingRaw,
//               )
//             : {};
//         const id = Date.now();
//         const prevKeys = Object.keys(current).length;
//         current[id] = data;

//         // 2) Пишем обновлённый батч и заново выставляем lock (окно «после последнего события»).
//         await redis.set(key, JSON.stringify(current));
//         await redis.set(lockKey, '1', 'PX', ttlMs);
//         const afterWrite = await this.buildSilentRedisDebugLine(
//             redis,
//             keyPrefix,
//         );
//         this.logger.log(
//             `[silent] redis data+lock written mergeId=${mergeId} key=${key} lock=${lockKey} prevKeys=${prevKeys} batchSize=${Object.keys(current).length} | ${afterWrite}`,
//         );

//         // 3) Счётчик (задуман под лимиты/антишторм; collectAndClear его не трогает).
//         const counterKey = `${keyPrefix}_counter`;
//         await redis.incr(counterKey);
//         await redis.expire(counterKey, Math.ceil(ttlMs / 1000));

//         // 4) Dedup + dispatch: только один победитель ставит Bull-джобу (SET NX), иначе гонка двух HTTP
//         // с alreadyQueued=null → две джобы на один пик / «вторая джоба без процессора» при нескольких consumer.
//         const atDedup = await this.buildSilentRedisDebugLine(redis, keyPrefix);
//         const jobKeyPre = await redis.get(jobKey);
//         this.logger.log(
//             `[silent] jobKey=${jobKey} preGet=${jobKeyPre ?? 'null'} mergeId=${mergeId} | ${atDedup}`,
//         );

//         const dispatchData = {
//             key: keyPrefix,
//             handlerId: jobName,
//             payload: jobPayload,
//         };
//         this.logger.log(
//             `[silent] dispatchData mergeId=${mergeId} ${JSON.stringify(dispatchData)}`,
//         );

//         const acquired = await redis.set(jobKey, '1', 'EX', 10, 'NX');
//         if (acquired === 'OK') {
//             const afterJobKey = await this.buildSilentRedisDebugLine(
//                 redis,
//                 keyPrefix,
//             );
//             this.logger.log(
//                 `[silent] queue path: jobKey acquired (NX) mergeId=${mergeId} jobName=${jobName} | ${afterJobKey}`,
//             );
//             try {
//                 // const bullJob = await this.queueDispatcher.dispatch(
//                 //     QueueNames.SILENT,
//                 //     jobName,
//                 //     dispatchData,
//                 // );
//                 const bullJob = await this.silentQueue.add(
//                     jobName,
//                     dispatchData,
//                 );
//                 this.logger.log(
//                     `[silent] dispatch ok mergeId=${mergeId} bullJobId=${bullJob.id} bullJobName=${bullJob.name}`,
//                 );
//                 this.scheduleSilentBullJobStateSnapshots(bullJob.id, mergeId);
//             } catch (err) {
//                 await redis.del(jobKey);
//                 const errorString = getErrorString(err);
//                 this.logger.error(
//                     `[silent] dispatch FAILED mergeId=${mergeId} jobName=${jobName} keyPrefix=${keyPrefix} (jobKey cleared)`,
//                     errorString,
//                 );
//                 throw err;
//             }
//         } else {
//             const jobTtlNow = await redis.ttl(jobKey);
//             this.logger.log(
//                 `[silent] skip dispatch (dedup NX): merged into _data only mergeId=${mergeId} jobKeyTTLs=${jobTtlNow} hint=in-flight Bull+_job or unconsumed job; ждём processor/follow-up/EX | ${atDedup}`,
//             );
//         }
//         const onExit = await this.buildSilentRedisDebugLine(redis, keyPrefix);
//         this.logger.log(
//             `[silent] handle exit mergeId=${mergeId} keyPrefix=${keyPrefix} | ${onExit}`,
//         );
//     }

//     /**
//      * Шаг воркера после тишины: один раз забирает весь накопленный _data и удаляет ключ.
//      * Если кто-то успел «съесть» или ключа нет — пустой объект (воркер всё равно может отработать no-op).
//      */
//     async collectAndClear<T>(keyPrefix: string): Promise<Record<string, T>> {
//         const redis = this.redisService.getClient();
//         const snapEnter = await this.buildSilentRedisDebugLine(
//             redis,
//             keyPrefix,
//         );
//         this.logger.log(
//             `[silent] collectAndClear enter keyPrefix=${keyPrefix} | ${snapEnter}`,
//         );
//         const key = `${keyPrefix}_data`;
//         const raw = await redis.get(key);
//         if (!raw) {
//             const snapEmpty = await this.buildSilentRedisDebugLine(
//                 redis,
//                 keyPrefix,
//             );
//             this.logger.warn(
//                 `[silent] collectAndClear: no _data at ${key} (другой воркер забрал / гонка) | ${snapEmpty}`,
//             );
//             return {};
//         }
//         await redis.del(key);
//         const data = this.parseJsonRecord<T>(raw);
//         const snapAfterDel = await this.silentRedisMetaLine(redis, keyPrefix);
//         this.logger.log(
//             `[silent] collectAndClear ok keys=${Object.keys(data).length} rawBytes=${raw.length} AFTER_DEL ${snapAfterDel} sample=${JSON.stringify(data).slice(0, 200)}`,
//         );
//         return data;
//     }

//     /**
//      * Ждём, пока в Redis не исчезнет lock (PX истёк и никто не продлил).
//      * Воркер не читает _data раньше времени — только после «окна тишины» после последнего handle().
//      */
//     async waitUntilSilent(lockKey: string, interval = 500): Promise<void> {
//         this.logger.log(`[silent] waitUntilSilent enter lockKey=${lockKey}`);
//         const redis = this.redisService.getClient();
//         let iterations = 0;
//         const logEveryMs = 10_000;
//         const logEveryIter = Math.max(1, Math.ceil(logEveryMs / interval));

//         const dataKey = lockKey.replace(/_lock$/, '_data');
//         const jobKey = lockKey.replace(/_lock$/, '_job');

//         while (true) {
//             const lockExists = await redis.exists(lockKey);
//             const isSilent = !lockExists;
//             iterations += 1;
//             if (iterations === 1 || iterations % logEveryIter === 0) {
//                 const [dataEx, lockPttl, jobTtl, dataStrlen] =
//                     await Promise.all([
//                         redis.exists(dataKey),
//                         redis.pttl(lockKey),
//                         redis.ttl(jobKey),
//                         redis.strlen(dataKey),
//                     ]);
//                 this.logger.log(
//                     `[silent] waitUntilSilent poll #${iterations} lockExists=${lockExists} lockKey=${lockKey} dataEx=${dataEx} dataStrlen=${dataStrlen} lockPTTLms=${lockPttl} jobTTLs=${jobTtl}`,
//                 );
//             }
//             if (isSilent) {
//                 this.logger.log(
//                     `[silent] waitUntilSilent done after ${iterations} polls (${iterations * interval}ms est.)`,
//                 );
//                 break;
//             }
//             await new Promise(resolve => setTimeout(resolve, interval));
//         }
//     }

//     /**
//      * Снимает Redis-флаг `{prefix}_job`, чтобы следующий HTTP сразу мог снова вызвать dispatch.
//      * Вызывается из воркера в finally после любого исхода (успех / ошибка / нет handler),
//      * иначе _job переживает успешный прогон и блокирует новую постановку до EX=10.
//      */
//     async releaseJobDedupKey(keyPrefix: string): Promise<void> {
//         const redis = this.redisService.getClient();
//         const jobKey = `${keyPrefix}_job`;
//         const deleted = await redis.del(jobKey);
//         this.logger.log(
//             `[silent] releaseJobDedupKey jobKey=${jobKey} redisDelCount=${deleted}`,
//         );
//     }
// }
