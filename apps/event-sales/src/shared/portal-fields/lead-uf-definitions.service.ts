import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BitrixService } from '@/modules/bitrix';
import { IBXField } from '@lib/bitrix/domain/crm/fields/bx-field.interface';
import { getErrorDetails } from '@/shared';
import { CRM_REF_ENTITY_TYPES, CrmRefEntityType } from './crm-ref-format.util';

/** Определение одного UF-поля лида «как оно есть на портале». */
export interface ILeadUfDefinition {
    /** Живые названия вариантов enum: bitrixId item'а → название. */
    itemNames: Record<string, string>;
    /**
     * Типы сущностей, разрешённые в crm-поле (SETTINGS). Пусто — поле не
     * crm-типа либо привязки не заданы.
     */
    crmTypes: CrmRefEntityType[];
}

/** UF-имя поля (`UF_CRM_TO_BASE_SALES`) → его определение. */
export type LeadUfDefinitions = Record<string, ILeadUfDefinition>;

const CACHE_APP = 'lead-request';
const CACHE_KEY = 'uf-definitions:lead';
/** Определения полей меняются установщиком; 10 минут — цена/свежесть. */
const CACHE_TTL_SEC = 600;

/**
 * Определения UF-полей ЛИДА, прочитанные с портала: живые названия вариантов
 * и привязки crm-полей (SETTINGS).
 *
 * Зачем читать, а не брать из нашего справочника: поле на портале могли
 * установить с другим набором привязок, а от их количества зависит ФОРМАТ
 * значения (один тип → голый id, несколько → `D_123`). Ошибка формата не
 * даёт ошибки — Битрикс молча не сохраняет значение, поле остаётся пустым.
 *
 * Стоимость: кэш-хит — 0 HTTP; промах — 2 HTTP на домен раз в 10 минут.
 * Портал недоступен — пустой результат: потребители работают на дефолтах.
 */
@Injectable()
export class LeadUfDefinitionsService {
    private readonly logger = new Logger(LeadUfDefinitionsService.name);

    constructor(private readonly appCache: AppCacheService) {}

    async resolve(
        domain: string,
        bitrix: BitrixService,
        ufNames: string[],
    ): Promise<LeadUfDefinitions> {
        if (!ufNames.length) return {};
        try {
            return await this.appCache.remember<LeadUfDefinitions>(
                {
                    app: CACHE_APP,
                    domain,
                    key: CACHE_KEY,
                    group: 'uf-definitions',
                    ttlSeconds: CACHE_TTL_SEC,
                },
                () => this.fetch(bitrix, ufNames),
            );
        } catch (error) {
            const { message } = getErrorDetails(error);
            this.logger.debug(
                `определения полей лида недоступны (${message}) — дефолты`,
            );
            return {};
        }
    }

    private async fetch(
        bitrix: BitrixService,
        ufNames: string[],
    ): Promise<LeadUfDefinitions> {
        const wanted = new Set(ufNames);

        // Волна 1: id нужных полей (лёгкий select).
        const listResponse = await bitrix.lead.getFieldsList({}, [
            'ID',
            'FIELD_NAME',
        ]);
        const ids = (listResponse?.result ?? [])
            .filter(row => wanted.has(row.FIELD_NAME))
            .map(row => row.ID);
        if (!ids.length) return {};

        // Волна 2: полные определения одним batch'ем (LIST + SETTINGS).
        for (const id of ids) {
            bitrix.batch.lead.getField(`uf_def_${id}`, id);
        }
        const chunks = await bitrix.api.callBatchWithConcurrency(1);

        const definitions: LeadUfDefinitions = {};
        for (const chunk of chunks) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                if (!/^uf_def_\d+$/.test(cmd)) continue;
                if (!value || typeof value !== 'object') continue;
                const field = value as IBXField;
                if (!field.FIELD_NAME || !wanted.has(field.FIELD_NAME)) {
                    continue;
                }
                definitions[field.FIELD_NAME] = {
                    itemNames: this.itemNamesOf(field),
                    crmTypes: this.crmTypesOf(field),
                };
            }
        }
        return definitions;
    }

    private itemNamesOf(field: IBXField): Record<string, string> {
        const names: Record<string, string> = {};
        for (const item of field.LIST ?? []) {
            const value = item.VALUE?.trim();
            if (item.ID && value) names[item.ID] = value;
        }
        return names;
    }

    /** Привязки crm-поля из SETTINGS: какие типы сущностей разрешены. */
    private crmTypesOf(field: IBXField): CrmRefEntityType[] {
        if (field.USER_TYPE_ID !== 'crm') return [];
        const settings = field.SETTINGS ?? {};
        return CRM_REF_ENTITY_TYPES.filter(type => settings[type] === 'Y');
    }
}
