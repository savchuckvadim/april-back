import { Injectable, Logger } from '@nestjs/common';
import { TranscriptionStoreService } from '@lib/call-lib';
import { PBXService } from '@/modules/pbx';
import { toCallEntityType } from '../domain/loaders/call-entity.loader';
import {
    CallClientTitlesReader,
    callClientKeyOf,
    type CallClientRef,
} from './call-client-titles.reader';

/** Сколько помним название клиента, мс. */
const TITLE_TTL_MS = 60 * 60 * 1000;
/** Больше стольких названий в памяти не держим. */
const CACHE_LIMIT = 5000;

interface CachedTitle {
    title: string | null;
    until: number;
}

/**
 * Клиент звонков страницы списка разборов: сущность звонка — из строки
 * расшифровки (база), название — из CRM портала. Названия помнятся час,
 * поэтому листание туда-обратно портал не нагружает. Сбой — строки без
 * клиента, не ошибка.
 *
 * Инстанс Битрикса берётся на запрос (`PBXService.init(domain)`) и в
 * сервисе не хранится.
 */
@Injectable()
export class CallClientTitlesService {
    private readonly logger = new Logger(CallClientTitlesService.name);
    private readonly cache = new Map<string, CachedTitle>();

    constructor(
        private readonly pbx: PBXService,
        private readonly transcriptions: TranscriptionStoreService,
    ) {}

    /** Номер расшифровки → название клиента; без названия ключа нет. */
    async titlesFor(
        domain: string,
        transcriptionIds: readonly string[],
        now: number = Date.now(),
    ): Promise<Map<string, string>> {
        const refs = await this.refsOf(domain, transcriptionIds);
        const missing = [...refs.values()].filter(ref => {
            const cached = this.cache.get(this.keyOf(domain, ref));
            return !cached || cached.until <= now;
        });
        if (missing.length > 0) await this.fetch(domain, missing, now);
        const titles = new Map<string, string>();
        for (const [transcriptionId, ref] of refs) {
            const title = this.cache.get(this.keyOf(domain, ref))?.title;
            if (title) titles.set(transcriptionId, title);
        }
        return titles;
    }

    private async refsOf(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<Map<string, CallClientRef>> {
        const refs = new Map<string, CallClientRef>();
        if (transcriptionIds.length === 0) return refs;
        const rows = await this.transcriptions
            .findLiteByIds(domain, transcriptionIds)
            .catch(() => []);
        for (const row of rows) {
            const entityType = toCallEntityType(row.entityType ?? '');
            const entityId = Number(row.entityId);
            if (entityType && Number.isInteger(entityId) && entityId > 0) {
                refs.set(row.id, { entityType, entityId: String(entityId) });
            }
        }
        return refs;
    }

    private async fetch(
        domain: string,
        refs: readonly CallClientRef[],
        now: number,
    ): Promise<void> {
        try {
            const { bitrix } = await this.pbx.init(domain);
            const titles = await new CallClientTitlesReader(bitrix).read(refs);
            this.trim(now);
            for (const ref of refs) {
                this.cache.set(this.keyOf(domain, ref), {
                    title: titles.get(callClientKeyOf(ref)) ?? null,
                    until: now + TITLE_TTL_MS,
                });
            }
        } catch (error) {
            this.logger.warn(
                `Клиенты звонков ${domain} для списка разборов не прочитаны: ${(error as Error).message}`,
            );
        }
    }

    private keyOf(domain: string, ref: CallClientRef): string {
        return `${domain}:${callClientKeyOf(ref)}`;
    }

    private trim(now: number): void {
        if (this.cache.size < CACHE_LIMIT) return;
        for (const [key, cached] of this.cache) {
            if (cached.until <= now) this.cache.delete(key);
        }
        if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    }
}
