import { createHash } from 'node:crypto';
// Прямой путь, а не барель @lib/shared: барель тянет DTO с декораторами
// class-validator, которым нужен reflect-metadata, — чистой утилите он ни к чему.
import { Semaphore } from '@lib/shared/lib/utils/semaphore.util';

/**
 * Ограничитель одновременных запросов к поставщику модели (11.11.2026).
 * Разбор звонка — 3–4 фокус-прохода и синтез, а очередь CALL_REPORT держит
 * до 9 заданий разом: без ограничителя к VibeCode уходило до 27–36
 * запросов на ключ одного портала, и затор создавали мы сами. Пределы —
 * настройка в админке (LlmGatewaySettingsService.vibecodeConcurrency).
 */

/** Пределы одновременных запросов: на ключ поставщика и на весь процесс. */
export interface LlmConcurrencyLimits {
    /** Одновременно на один ключ (у VibeCode ключ свой у каждого портала). */
    perKey: number;
    /** Одновременно на все ключи процесса приложения. */
    total: number;
}

/**
 * Отпечаток ключа для Map семафоров — начало sha256 в hex. Сам ключ —
 * секрет: отпечаток можно показать в логе или отладчике, ключ по нему не
 * восстановить.
 */
export function apiKeyFingerprint(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

/** Ответ вызова под ограничителем и сколько он ждал слотов. */
export interface LimitedCall<T> {
    value: T;
    /**
     * От постановки в очередь до получения обоих слотов, мс; 0 — слоты
     * были свободны.
     */
    queueMs: number;
}

/**
 * Два уровня ограничения: свой семафор на каждый ключ (Map по отпечатку,
 * не по секрету) и общий семафор процесса. Ждущие идут по очереди (FIFO).
 *
 * Порядок захвата у всех вызовов один — сначала слот ключа, потом общий:
 * - взаимоблокировки нет: общий слот держит только вызов, у которого слот
 *   ключа уже есть и который больше ничего не ждёт — он сразу идёт к
 *   модели и отпускает оба слота, цикла ожидания не возникает;
 * - простоя нет: общий слот достаётся только тому, кто может отправлять
 *   сразу. При обратном порядке вызов занимал бы общий слот и стоял в
 *   очереди своего ключа, а другие порталы ждали бы общий слот впустую;
 * - заодно один портал держит в общей очереди не больше `perKey` вызовов
 *   и не оттесняет остальных.
 *
 * Map растёт по числу разных ключей (десятки порталов) — чистка не нужна.
 */
export class KeyedConcurrencyLimiter {
    private limits: LlmConcurrencyLimits;
    private readonly total: Semaphore;
    private readonly perKey = new Map<string, Semaphore>();

    constructor(limits: LlmConcurrencyLimits) {
        this.limits = { ...limits };
        this.total = new Semaphore(limits.total);
    }

    /**
     * Новые пределы (правка в админке, без перезапуска): больше — ждущие
     * сразу получают слоты; меньше — идущие запросы доделываются, новые ждут,
     * пока занятых не станет меньше предела. Те же пределы — ничего не делает.
     */
    setLimits(limits: LlmConcurrencyLimits): void {
        if (
            limits.perKey === this.limits.perKey &&
            limits.total === this.limits.total
        ) {
            return;
        }
        this.limits = { ...limits };
        this.total.setLimit(limits.total);
        for (const slot of this.perKey.values()) slot.setLimit(limits.perKey);
    }

    /**
     * `fn` вызывается только после получения обоих слотов: всё, что он
     * создаёт (запрос и его таймаут), начинается после очереди. Слоты
     * освобождаются всегда — и при ответе, и при ошибке `fn`.
     */
    async run<T>(
        apiKey: string,
        fn: () => Promise<T>,
    ): Promise<LimitedCall<T>> {
        const queuedAt = Date.now();
        let queueMs = 0;
        const value = await this.slotOf(apiKey).run(() =>
            this.total.run(() => {
                queueMs = Math.max(0, Date.now() - queuedAt);
                return fn();
            }),
        );
        return { value, queueMs };
    }

    /** Семафор ключа: создаётся при первом вызове с этим ключом. */
    private slotOf(apiKey: string): Semaphore {
        const id = apiKeyFingerprint(apiKey);
        let slot = this.perKey.get(id);
        if (!slot) {
            slot = new Semaphore(this.limits.perKey);
            this.perKey.set(id, slot);
        }
        return slot;
    }
}
