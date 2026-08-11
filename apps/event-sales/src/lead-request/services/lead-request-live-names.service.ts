import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BitrixService } from '@/modules/bitrix';
import { IBXField } from '@lib/bitrix/domain/crm/fields/bx-field.interface';
import { getErrorDetails } from '@/shared';

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

        // Волна 1: id всех UF-полей лида (лёгкий select). Ответ типизирован
        // библиотекой (IBXField[]) — ID и FIELD_NAME читаем без кастов.
        const listResponse = await bitrix.lead.getFieldsList({}, [
            'ID',
            'FIELD_NAME',
        ]);
        const ids = (listResponse?.result ?? [])
            .filter(row => wanted.has(row.FIELD_NAME))
            .map(row => ({ id: row.ID, fieldName: row.FIELD_NAME }));
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
                // Единственный каст — на границе batch-ответа (он приходит
                // unknown по природе batch API); дальше форма IBXField.
                const field = value as IBXField;
                if (!field.FIELD_NAME || !wanted.has(field.FIELD_NAME)) {
                    continue;
                }
                const byId: Record<string, string> = {};
                for (const item of field.LIST ?? []) {
                    const itemValue = item.VALUE?.trim();
                    if (item.ID && itemValue) byId[item.ID] = itemValue;
                }
                if (Object.keys(byId).length) names[field.FIELD_NAME] = byId;
            }
        }
        return names;
    }
}
