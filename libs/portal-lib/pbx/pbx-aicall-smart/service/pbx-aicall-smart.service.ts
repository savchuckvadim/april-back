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
    buildCallReportItemFieldName,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_GROUP,
    CALL_REPORT_SMART_TYPE,
} from '../type/pbx-aicall-smart.type';

/** Резолв смарта «AI-анализ звонков» для записи элементов crm.item. */
export interface AicallSmartInfo {
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
 * Канонический pbx-сервис смарта «AI-анализ звонков» (связка portal↔bitrix).
 *
 * Резолв — как у всех pbx-сущностей: сначала PortalModel (online-кэш
 * portal_${domain}), при отсутствии/пустоте — fallback на локальное зеркало
 * PortalDB (smarts + bitrixfields/bitrixfield_items), которое обновляется
 * установщиком синхронно. Мультипортальность — через PBXService.init.
 */
@Injectable()
export class PbxAicallSmartService {
    private readonly logger = new Logger(PbxAicallSmartService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalStoreService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    /** Инфо смарта на портале; null — смарт не установлен. */
    async resolveInfo(domain: string): Promise<AicallSmartInfo | null> {
        const fromPortal = await this.resolveFromPortalModel(domain).catch(
            error => {
                this.logger.warn(
                    `PortalModel-резолв aicall не удался (${domain}): ${(error as Error).message}`,
                );
                return null;
            },
        );
        if (fromPortal) return fromPortal;

        return this.resolveFromDb(domain).catch(error => {
            this.logger.warn(
                `БД-резолв aicall не удался (${domain}): ${(error as Error).message}`,
            );
            return null;
        });
    }

    /** Основной путь: IPortal.smarts через PortalModel (как event-report). */
    private async resolveFromPortalModel(
        domain: string,
    ): Promise<AicallSmartInfo | null> {
        const { PortalModel: portalModel } = await this.pbxService.init(domain);
        const smart = portalModel.getSmartByType(CALL_REPORT_SMART_TYPE);
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
    private async resolveFromDb(
        domain: string,
    ): Promise<AicallSmartInfo | null> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) return null;
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            CALL_REPORT_SMART_TYPE,
            CALL_REPORT_SMART_GROUP,
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
                buildCallReportItemFieldName(typeId, field.code);
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
     * канонический шаг установки (аналог syncWithDb typed-entity):
     * благодаря ему PortalModel/fallback видят поля и enum-id без похода
     * в Bitrix. Вызывается установщиком после создания полей.
     */
    async mirrorFields(
        domain: string,
        /** id смарт-типа из crm.type.list (НЕ entityTypeId). */
        typeId: number,
        bxFields: IUserFieldConfig[],
    ): Promise<number> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) throw new Error('Portal not found (локальная БД)');
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            CALL_REPORT_SMART_TYPE,
            CALL_REPORT_SMART_GROUP,
        );
        if (!row) throw new Error('Строка smarts не найдена (зеркало типа)');

        const parentType = `${CALL_REPORT_SMART_GROUP}_${CALL_REPORT_SMART_TYPE}`;
        const entities: PbxFieldEntity[] = [];
        for (const def of CALL_REPORT_SMART_FIELDS) {
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
            entity.bitrixCamelId = buildCallReportItemFieldName(
                typeId,
                def.code,
            );
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

        await this.pbxFieldService.upsertFields(entities);
        return entities.length;
    }

    private lowerFirst(value: string): string {
        return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
    }
}
