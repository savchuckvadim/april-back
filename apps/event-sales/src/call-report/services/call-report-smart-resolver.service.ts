import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { RedisService } from '@lib/core/redis/redis.service';
import { EUserFieldType } from '@/modules/bitrix';
import {
    buildCallReportUfName,
    CALL_REPORT_SMART_CODE,
    CALL_REPORT_SMART_FIELDS,
} from '../config/call-report-smart.config';

const CACHE_TTL_SEC = 6 * 60 * 60;

/** Данные смарта на портале, нужные writer'у для записи элементов. */
export interface CallReportSmartInfo {
    entityTypeId: number;
    /**
     * Маппинг enum-полей: код поля конфига → (xmlId значения → Bitrix id).
     * crm.item принимает enumeration только числовым id элемента.
     */
    enumItems: Record<string, Record<string, number>>;
}

/**
 * Резолвит смарт «AI-анализ звонков» на портале по const-коду
 * (без таблицы smarts — по требованию задачи): спрашивает Bitrix
 * crm.type + userfieldconfig и кэширует результат в Redis на 6 часов.
 *
 * Инстанс bitrix берётся строго через PBXService.init(domain) на каждый
 * вызов — в this ничего битриксового не хранится (правило CLAUDE.md).
 */
@Injectable()
export class CallReportSmartResolverService {
    private readonly logger = new Logger(CallReportSmartResolverService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly redisService: RedisService,
    ) {}

    /** Инфо смарта на портале или null, если смарт не установлен. */
    async resolve(domain: string): Promise<CallReportSmartInfo | null> {
        const cacheKey = this.buildCacheKey(domain);
        const redis = this.redisService.getClient();

        const cached = await redis.get(cacheKey);
        if (cached) {
            try {
                return JSON.parse(cached) as CallReportSmartInfo;
            } catch {
                await redis.del(cacheKey);
            }
        }

        const info = await this.loadFromBitrix(domain);
        if (!info) return null;

        await redis.set(cacheKey, JSON.stringify(info), 'EX', CACHE_TTL_SEC);
        return info;
    }

    /** Сброс кэша (вызывается установщиком после install-smart). */
    async invalidate(domain: string): Promise<void> {
        await this.redisService.getClient().del(this.buildCacheKey(domain));
    }

    private async loadFromBitrix(
        domain: string,
    ): Promise<CallReportSmartInfo | null> {
        const { bitrix } = await this.pbxService.init(domain);
        const types = await bitrix.smartType.getListFull({
            filter: { code: CALL_REPORT_SMART_CODE },
            start: -1,
            order: { id: 'asc' },
        });
        const smart = types.find(type => type.code === CALL_REPORT_SMART_CODE);
        if (!smart) {
            this.logger.warn(
                `Смарт ${CALL_REPORT_SMART_CODE} не установлен на ${domain}`,
            );
            return null;
        }

        const entityTypeId = Number(smart.entityTypeId);
        const fields = await bitrix.userFieldConfig.getAllWithItems('crm', {
            entityId: `CRM_${entityTypeId}`,
        });

        const enumItems: Record<string, Record<string, number>> = {};
        for (const def of CALL_REPORT_SMART_FIELDS) {
            if (def.type !== 'enumeration') continue;
            const fieldName = buildCallReportUfName(entityTypeId, def.code);
            const bxField = fields.find(
                field =>
                    field.fieldName === fieldName &&
                    field.userTypeId === EUserFieldType.ENUMERATION,
            );
            if (!bxField?.enum) continue;
            const mapping: Record<string, number> = {};
            for (const item of bxField.enum) {
                if (item.xmlId && item.id != null) {
                    mapping[item.xmlId] = Number(item.id);
                }
            }
            enumItems[def.code] = mapping;
        }

        return { entityTypeId, enumItems };
    }

    private buildCacheKey(domain: string): string {
        return `call-report:smart:${domain}`;
    }
}
