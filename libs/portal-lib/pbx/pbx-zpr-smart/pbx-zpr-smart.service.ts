import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { IUserFieldConfig } from '@/modules/bitrix';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldService } from '@lib/portal-lib/pbx-domain/field/';
import {
    PbxFieldEntity,
    PbxFieldItemEntity,
} from '@lib/portal-lib/pbx-domain/field/entity/pbx-field.entity';
import { BtxCategoryRepository } from '@lib/portal-lib/pbx-domain/category';
import {
    buildZprItemFieldName,
    ZPR_SMART_FIELDS,
    ZPR_SMART_GROUP,
    ZPR_SMART_TYPE,
    ZprSmartFieldCode,
    ZprSmartStageCode,
} from './type/pbx-zpr-smart.type';

/** Резолв смарта «Звонки По решению» для записи элементов crm.item. */
export interface ZprSmartInfo {
    /** entityTypeId — адресация элементов crm.item.*. */
    entityTypeId: number;
    /**
     * id смарт-типа из crm.type.list — основа UF-имён полей
     * (UF_CRM_{typeId}_..., по докам userfieldconfig; НЕ entityTypeId!).
     */
    typeId: number;
    /**
     * Код поля конфига → фактический camel-ключ crm.item (ufCrm7BaseDeal).
     *
     * Почему `Partial`, а не голый Record: мапа строится В РАНТАЙМЕ из того,
     * что реально стоит на портале. Поля может не быть (смарт установлен не
     * полностью, поле добавили позже) — `Partial` заставляет вызывающего
     * честно обработать `undefined` вместо вранья про гарантию.
     */
    ufKeyByCode: Partial<Record<ZprSmartFieldCode, string>>;
    /** Код enumeration-поля → его значения (id — числовой Bitrix enum id). */
    enumItems: Partial<
        Record<ZprSmartFieldCode, { id: number; code: string; value: string }[]>
    >;
    /**
     * Код стадии ('zpr_plan') → полный stageId ('DT1038_9:PLAN').
     * Типизирован union'ом кодов: опечатка вроде `stageIdByCode['zpr_pendin']`
     * теперь не компилируется, а редактор подсказывает список стадий.
     */
    stageIdByCode: Partial<Record<ZprSmartStageCode, string>>;
}

/** Запись кэша резолва: null тоже кэшируем (смарт не установлен). */
interface ZprInfoCacheEntry {
    info: ZprSmartInfo | null;
    expiresAt: number;
}

/** TTL кэша резолва: смарт ставится редко, 10 минут — безопасный лаг. */
const INFO_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Канонический pbx-сервис смарта «Звонки По решению» (связка portal↔bitrix,
 * каркас 1-в-1 с PbxSkapSmartService).
 *
 * Резолв — как у всех pbx-сущностей: сначала PortalModel (online-кэш
 * portal_${domain}), при отсутствии/неполноте — fallback на локальное
 * зеркало PortalDB (smarts + bitrixfields + btx_categories/btx_stages),
 * которое обновляется установщиком синхронно. Отличие от СКАП — стадии:
 * ЗПР первый const-смарт с воронкой, stageIdByCode собирается по формуле
 * crm.status динамических типов DT{entityTypeId}_{bxCategoryId}:{suffix}.
 *
 * resolveInfo → null = смарт не установлен (или установлен без стадий) —
 * self-gate потребителей (zpr-flow молча пропускает джобы).
 */
@Injectable()
export class PbxZprSmartService {
    private readonly logger = new Logger(PbxZprSmartService.name);
    /**
     * Кэш по домену: резолв дёргается на каждый джоб сайд-очереди, а слепок
     * портала за TTL не меняется. null тоже кэшируем — «смарт не установлен»
     * не должен ходить в Bitrix на каждый отчёт.
     */
    private readonly cacheByDomain = new Map<string, ZprInfoCacheEntry>();

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalStoreService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly categoryRepository: BtxCategoryRepository,
    ) {}

    /** Инфо смарта на портале; null — смарт не установлен (self-gate). */
    async resolveInfo(domain: string): Promise<ZprSmartInfo | null> {
        const cached = this.cacheByDomain.get(domain);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.info;
        }

        const fromPortal = await this.resolveFromPortalModel(domain).catch(
            error => {
                this.logger.warn(
                    `PortalModel-резолв zpr не удался (${domain}): ${(error as Error).message}`,
                );
                return null;
            },
        );
        const info =
            fromPortal ??
            (await this.resolveFromDb(domain).catch(error => {
                this.logger.warn(
                    `БД-резолв zpr не удался (${domain}): ${(error as Error).message}`,
                );
                return null;
            }));

        this.cacheByDomain.set(domain, {
            info,
            expiresAt: Date.now() + INFO_CACHE_TTL_MS,
        });
        return info;
    }

    /** Сброс кэша домена — обязательный шаг установщика после install. */
    invalidate(domain: string): void {
        this.cacheByDomain.delete(domain);
    }

    /** Основной путь: IPortal.smarts через PortalModel. */
    private async resolveFromPortalModel(
        domain: string,
    ): Promise<ZprSmartInfo | null> {
        const { PortalModel: portalModel } = await this.pbxService.init(domain);
        const smart = portalModel.getSmartByType(ZPR_SMART_TYPE);
        if (!smart?.fields?.length) return null;

        const raw = smart as unknown as Record<string, unknown>;
        const entityTypeId = Number(raw.entityTypeId ?? raw.bitrixId);
        // bitrixId строки smarts = id смарт-типа (crm.type.list id).
        const typeId = Number(raw.bitrixId ?? raw.entityTypeId);
        if (!Number.isFinite(entityTypeId) || entityTypeId <= 0) return null;

        const ufKeyByCode: Record<string, string> = {};
        const enumItems: ZprSmartInfo['enumItems'] = {};
        for (const field of smart.fields) {
            const fieldRaw = field as unknown as Record<string, unknown>;
            const camel =
                typeof fieldRaw.bitrixCamelId === 'string' &&
                fieldRaw.bitrixCamelId
                    ? fieldRaw.bitrixCamelId
                    : this.lowerFirst(String(field.bitrixId ?? ''));
            if (!field.code || !camel) continue;
            ufKeyByCode[field.code] = camel;
            if (field.items?.length) {
                enumItems[field.code] = field.items
                    .filter(item => item.code && item.bitrixId != null)
                    .map(item => ({
                        id: Number(item.bitrixId),
                        code: String(item.code),
                        value: String(item.name ?? item.title ?? ''),
                    }));
            }
        }

        const stageIdByCode = this.buildStageIdByCode(
            entityTypeId,
            smart.categories ?? [],
        );
        // Стадии не доехали до слепка (ставились после кэширования) —
        // отдаём null, чтобы сработал fallback на свежую PortalDB.
        if (!Object.keys(stageIdByCode).length) return null;

        return { entityTypeId, typeId, ufKeyByCode, enumItems, stageIdByCode };
    }

    /** Fallback: локальное зеркало PortalDB (свежее сразу после установки). */
    private async resolveFromDb(domain: string): Promise<ZprSmartInfo | null> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) return null;
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            ZPR_SMART_TYPE,
            ZPR_SMART_GROUP,
        );
        if (!row) return null;
        const entityTypeId = Number(row.entityTypeId);
        // smarts.bitrixId = id смарт-типа (crm.type.list id) — основа UF-имён.
        const typeId = Number(row.bitrixId ?? row.entityTypeId);

        const fields = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.SMART,
            row.id,
        );

        const ufKeyByCode: Record<string, string> = {};
        const enumItems: ZprSmartInfo['enumItems'] = {};
        for (const field of fields) {
            if (!field.code) continue;
            ufKeyByCode[field.code] =
                field.bitrixCamelId ||
                buildZprItemFieldName(typeId, field.code);
            if (field.items?.length) {
                enumItems[field.code] = field.items
                    .filter(item => item.code)
                    .map(item => ({
                        id: Number(item.bitrixId),
                        code: String(item.code),
                        value: String(item.name ?? item.title ?? ''),
                    }));
            }
        }

        const categories =
            (await this.categoryRepository.findByEntity(
                PbxEntityTypePrisma.SMART,
                Number(row.id),
            )) ?? [];
        const stageIdByCode = this.buildStageIdByCode(entityTypeId, categories);
        if (!Object.keys(stageIdByCode).length) {
            // Тип есть, стадий нет — установка не завершена; честный self-gate
            // безопаснее записи элементов мимо воронки.
            this.logger.warn(
                `zpr на ${domain}: строка smarts есть, стадии в зеркале не найдены — resolveInfo=null`,
            );
            return null;
        }

        return { entityTypeId, typeId, ufKeyByCode, enumItems, stageIdByCode };
    }

    /**
     * Код стадии → полный stageId. Формат crm.status динамических типов:
     * STATUS_ID = DT{entityTypeId}_{bxCategoryId}:{суффикс из btx_stages}
     * (та же формула, что у SmartCategoryStageStrategy установщика).
     * Воронка у ЗПР одна; на всякий случай первая категория приоритетна.
     */
    private buildStageIdByCode(
        entityTypeId: number,
        categories: Array<{
            bitrixId: string | number;
            stages?: Array<{ code: string; bitrixId: string }> | null;
        }>,
    ): Record<string, string> {
        const map: Record<string, string> = {};
        for (const category of categories) {
            const bxCategoryId = Number(category.bitrixId);
            if (!Number.isFinite(bxCategoryId) || bxCategoryId <= 0) continue;
            for (const stage of category.stages ?? []) {
                if (!stage.code || !stage.bitrixId) continue;
                if (map[stage.code]) continue;
                map[stage.code] =
                    `DT${entityTypeId}_${bxCategoryId}:${stage.bitrixId}`;
            }
        }
        return map;
    }

    /**
     * Зеркало полей смарта в PortalDB (bitrixfields + bitrixfield_items) —
     * канонический шаг установки: благодаря ему PortalModel/fallback видят
     * поля и enum-id без похода в Bitrix. Вызывается установщиком после
     * создания полей.
     */
    async mirrorFields(
        domain: string,
        /** id смарт-типа из crm.type.list (НЕ entityTypeId). */
        typeId: number,
        bxFields: IUserFieldConfig[],
        /**
         * entityTypeId смарта — для чтения ФАКТИЧЕСКИХ camel-ключей полей из
         * crm.item.fields: формула ufCrm{typeId}{Pascal} не всегда совпадает
         * с реальностью (боевой инцидент UF_CRM_94_TRANSCRIPT_1).
         */
        entityTypeId?: number,
    ): Promise<number> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found (локальная БД)');
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            ZPR_SMART_TYPE,
            ZPR_SMART_GROUP,
        );
        if (!row) throw new Error('Строка smarts не найдена (зеркало типа)');

        const camelByNormalized = entityTypeId
            ? await this.loadItemFieldKeys(domain, entityTypeId)
            : {};
        this.logger.log(
            `Зеркало полей zpr (${domain}): crm.item.fields дал ` +
                `${Object.keys(camelByNormalized).length} camel-ключей` +
                `${entityTypeId ? '' : ' (entityTypeId не передан — формула)'}`,
        );

        const parentType = `${ZPR_SMART_GROUP}_${ZPR_SMART_TYPE}`;
        const entities: PbxFieldEntity[] = [];
        const formulaMismatches: string[] = [];
        for (const def of ZPR_SMART_FIELDS) {
            const fieldName = `UF_CRM_${typeId}_${def.code}`;
            const bxField = bxFields.find(
                field => field.fieldName === fieldName,
            );
            if (!bxField) continue;
            const entity = new PbxFieldEntity();
            entity.name = def.name;
            entity.title = def.name;
            entity.code = def.code;
            entity.type = def.type;
            entity.isPlural = bxField.multiple === 'Y';
            entity.bitrixId = fieldName;
            const formulaCamel = buildZprItemFieldName(typeId, def.code);
            const factualCamel =
                camelByNormalized[this.normalizeKey(fieldName)];
            if (factualCamel && factualCamel !== formulaCamel) {
                formulaMismatches.push(`${formulaCamel}→${factualCamel}`);
            }
            entity.bitrixCamelId = factualCamel ?? formulaCamel;
            entity.entity_type = PbxEntityTypePrisma.SMART;
            entity.entity_id = Number(row.id);
            entity.parent_type = parentType;
            entity.items = (bxField.enum ?? []).map(item => {
                const itemEntity = new PbxFieldItemEntity();
                itemEntity.name = String(item.value ?? '');
                itemEntity.title = String(item.value ?? '');
                itemEntity.code = String(item.xmlId ?? '');
                itemEntity.bitrixId = Number(item.id);
                return itemEntity;
            });
            entities.push(entity);
        }

        if (formulaMismatches.length) {
            this.logger.warn(
                `camel-ключи расходятся с формулой (${formulaMismatches.length} шт): ` +
                    formulaMismatches.slice(0, 6).join(', '),
            );
        }

        await this.pbxFieldService.upsertFields(entities);
        return entities.length;
    }

    /**
     * Фактические camel-ключи UF-полей смарта из crm.item.fields:
     * normalized(UF-имя без подчёркиваний, lowercase) → реальный ключ.
     * Fail-open: пустая карта откатывает bitrixCamelId на формулу.
     */
    private async loadItemFieldKeys(
        domain: string,
        entityTypeId: number,
    ): Promise<Record<string, string>> {
        try {
            const { bitrix } = await this.pbxService.init(domain);
            const response = await bitrix.item.fields(entityTypeId);
            const map: Record<string, string> = {};
            for (const key of Object.keys(response?.result?.fields ?? {})) {
                map[this.normalizeKey(key)] = key;
            }
            return map;
        } catch (error) {
            this.logger.warn(
                `crm.item.fields не прочитан (${domain}, ${entityTypeId}): ${(error as Error).message} — camel-ключи по формуле`,
            );
            return {};
        }
    }

    /** UF_CRM_7_ZPR_LEAD и ufCrm7ZprLead → 'ufcrm7zprlead'. */
    private normalizeKey(value: string): string {
        return value.replace(/_/g, '').toLowerCase();
    }

    private lowerFirst(value: string): string {
        return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
    }
}
