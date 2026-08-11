import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BitrixService } from '@/modules/bitrix';
import { getErrorDetails } from '@/shared';

type BxRow = Record<string, unknown>;

/** UF-имя поля → (bitrixId варианта → живое название на портале). */
export type LeadLiveItemNames = Record<string, Record<string, string>>;

const CACHE_APP = 'lead-request';
const CACHE_KEY = 'live-names:lead';
/** Названия почти не меняются; 10 минут — компромисс цена/свежесть. */
const CACHE_TTL_SEC = 600;

/**
 * Живые названия вариантов enum-полей лида «как в Битриксе на портале»:
 * наша DB актуализируется rescan'ом и может отставать, а в карточке заявки
 * менеджер должен видеть ровно те названия, что в CRM.
 *
 * Стоимость: кэш-хит — 0 HTTP; промах — 2 HTTP на домен раз в 10 минут
 * (crm.lead.userfield.list ID+FIELD_NAME → batch userfield.get нужных).
 * Ошибка портала — тихий fallback на названия из DB (карточка не ломается).
 *
 * bitrix приходит параметром (per-domain, в this не хранится — CLAUDE.md).
 */
@Injectable()
export class LeadRequestLiveNamesService {
    private readonly logger = new Logger(LeadRequestLiveNamesService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async resolve(
        domain: string,
        bitrix: BitrixService,
        fieldNames: string[],
    ): Promise<LeadLiveItemNames> {
        if (!fieldNames.length) return {};
        try {
            return await this.appCache.remember<LeadLiveItemNames>(
                {
                    app: CACHE_APP,
                    domain,
                    key: CACHE_KEY,
                    group: 'live-names',
                    ttlSeconds: CACHE_TTL_SEC,
                },
                () => this.fetch(bitrix, fieldNames),
            );
        } catch (error) {
            const { message } = getErrorDetails(error);
            this.logger.debug(
                `live-названия недоступны (${message}) — использую DB`,
            );
            return {};
        }
    }

    private async fetch(
        bitrix: BitrixService,
        fieldNames: string[],
    ): Promise<LeadLiveItemNames> {
        const wanted = new Set(fieldNames);

        // Волна 1: id всех UF-полей лида (лёгкий select).
        const listResponse = await bitrix.lead.getFieldsList({}, [
            'ID',
            'FIELD_NAME',
        ]);
        const rows = (listResponse?.result ?? []) as BxRow[];
        const ids: { id: string; fieldName: string }[] = [];
        for (const row of rows) {
            const id = this.scalarText(row.ID);
            const fieldName = this.scalarText(row.FIELD_NAME);
            if (id && fieldName && wanted.has(fieldName)) {
                ids.push({ id, fieldName });
            }
        }
        if (!ids.length) return {};

        // Волна 2: определения нужных полей одним batch'ем (LIST с названиями).
        for (const { id } of ids) {
            bitrix.batch.lead.getField(`live_uf_${id}`, id);
        }
        const chunks = await bitrix.api.callBatchWithConcurrency(1);

        const names: LeadLiveItemNames = {};
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                const match = /^live_uf_(\d+)$/.exec(cmd);
                if (!match || !value || typeof value !== 'object') continue;
                const field = value as BxRow;
                const fieldName = this.scalarText(field.FIELD_NAME);
                if (!fieldName || !wanted.has(fieldName)) continue;
                const items = Array.isArray(field.LIST)
                    ? (field.LIST as BxRow[])
                    : [];
                const byId: Record<string, string> = {};
                for (const item of items) {
                    const itemId = this.scalarText(item.ID);
                    const itemValue = this.scalarText(item.VALUE);
                    if (itemId && itemValue) byId[itemId] = itemValue;
                }
                if (Object.keys(byId).length) names[fieldName] = byId;
            }
        }
        return names;
    }

    /** Строка из скалярного значения Битрикса; объекты/массивы — null. */
    private scalarText(raw: unknown): string | null {
        if (typeof raw === 'string') return raw.trim() || null;
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return null;
    }
}
