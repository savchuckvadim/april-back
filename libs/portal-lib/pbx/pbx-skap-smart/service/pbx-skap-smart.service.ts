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
import {
    buildSkapItemFieldName,
    SKAP_SMART_FIELDS,
    SKAP_SMART_GROUP,
    SKAP_SMART_TYPE,
} from '../type/pbx-skap-smart.type';

/** Резолв смарта «СКАП» для записи элементов crm.item. */
export interface SkapSmartInfo {
    /** entityTypeId — адресация элементов crm.item.*. */
    entityTypeId: number;
    /**
     * id смарт-типа из crm.type.list — основа UF-имён полей
     * (UF_CRM_{typeId}_..., по докам userfieldconfig; НЕ entityTypeId!).
     */
    typeId: number;
    /** Код поля конфига → ключ поля crm.item (ufCrm{typeId}{Camel}). */
    ufKeyByCode: Record<string, string>;
    /** Код enum-поля → (код значения → числовой Bitrix enum id). */
    enumItems: Record<string, Record<string, number>>;
}

/**
 * Канонический pbx-сервис смарта «СКАП» (связка portal↔bitrix).
 *
 * Резолв — как у всех pbx-сущностей: сначала PortalModel (online-кэш
 * portal_${domain}), при отсутствии — fallback на локальное зеркало
 * PortalDB (smarts + bitrixfields/bitrixfield_items), которое обновляется
 * установщиком синхронно. Мультипортальность — через PBXService.init.
 */
@Injectable()
export class PbxSkapSmartService {
    private readonly logger = new Logger(PbxSkapSmartService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalStoreService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    /** Инфо смарта на портале; null — смарт не установлен. */
    async resolveInfo(domain: string): Promise<SkapSmartInfo | null> {
        const fromPortal = await this.resolveFromPortalModel(domain).catch(
            error => {
                this.logger.warn(
                    `PortalModel-резолв skap не удался (${domain}): ${(error as Error).message}`,
                );
                return null;
            },
        );
        if (fromPortal) return fromPortal;

        return this.resolveFromDb(domain).catch(error => {
            this.logger.warn(
                `БД-резолв skap не удался (${domain}): ${(error as Error).message}`,
            );
            return null;
        });
    }

    /** Основной путь: IPortal.smarts через PortalModel. */
    private async resolveFromPortalModel(
        domain: string,
    ): Promise<SkapSmartInfo | null> {
        const { PortalModel: portalModel } = await this.pbxService.init(domain);
        const smart = portalModel.getSmartByType(SKAP_SMART_TYPE);
        if (!smart?.fields?.length) return null;

        const raw = smart as unknown as Record<string, unknown>;
        const entityTypeId = Number(raw.entityTypeId ?? raw.bitrixId);
        // bitrixId строки smarts = id смарт-типа (crm.type.list id).
        const typeId = Number(raw.bitrixId ?? raw.entityTypeId);
        if (!Number.isFinite(entityTypeId) || entityTypeId <= 0) return null;

        const ufKeyByCode: Record<string, string> = {};
        const enumItems: Record<string, Record<string, number>> = {};
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
                const mapping: Record<string, number> = {};
                for (const item of field.items) {
                    if (item.code && item.bitrixId != null) {
                        mapping[item.code] = Number(item.bitrixId);
                    }
                }
                enumItems[field.code] = mapping;
            }
        }
        return { entityTypeId, typeId, ufKeyByCode, enumItems };
    }

    /** Fallback: локальное зеркало PortalDB (свежее сразу после установки). */
    private async resolveFromDb(domain: string): Promise<SkapSmartInfo | null> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) return null;
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            SKAP_SMART_TYPE,
            SKAP_SMART_GROUP,
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
        const enumItems: Record<string, Record<string, number>> = {};
        for (const field of fields) {
            if (!field.code) continue;
            ufKeyByCode[field.code] =
                field.bitrixCamelId ||
                buildSkapItemFieldName(typeId, field.code);
            if (field.items?.length) {
                const mapping: Record<string, number> = {};
                for (const item of field.items) {
                    if (item.code) mapping[item.code] = Number(item.bitrixId);
                }
                enumItems[field.code] = mapping;
            }
        }
        return { entityTypeId, typeId, ufKeyByCode, enumItems };
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
            SKAP_SMART_TYPE,
            SKAP_SMART_GROUP,
        );
        if (!row) throw new Error('Строка smarts не найдена (зеркало типа)');

        const camelByNormalized = entityTypeId
            ? await this.loadItemFieldKeys(domain, entityTypeId)
            : {};
        this.logger.log(
            `Зеркало полей skap (${domain}): crm.item.fields дал ` +
                `${Object.keys(camelByNormalized).length} camel-ключей` +
                `${entityTypeId ? '' : ' (entityTypeId не передан — формула)'}`,
        );

        const parentType = `${SKAP_SMART_GROUP}_${SKAP_SMART_TYPE}`;
        const entities: PbxFieldEntity[] = [];
        const formulaMismatches: string[] = [];
        for (const def of SKAP_SMART_FIELDS) {
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
            const formulaCamel = buildSkapItemFieldName(typeId, def.code);
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
            const response = (await bitrix.api.call('crm.item.fields', {
                entityTypeId,
            })) as { result?: { fields?: Record<string, unknown> } };
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

    /** UF_CRM_94_IP_LIST и ufCrm94IpList → 'ufcrm94iplist'. */
    private normalizeKey(value: string): string {
        return value.replace(/_/g, '').toLowerCase();
    }

    private lowerFirst(value: string): string {
        return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
    }
}
