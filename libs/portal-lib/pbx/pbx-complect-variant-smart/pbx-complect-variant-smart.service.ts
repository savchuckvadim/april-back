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
    buildComplectVariantItemFieldName,
    COMPLECT_VARIANT_SMART_FIELDS,
    COMPLECT_VARIANT_SMART_GROUP,
    COMPLECT_VARIANT_SMART_TYPE,
} from './type/pbx-complect-variant-smart.type';

/** Резолв смарта «Варианты комплекта» для записи элементов crm.item. */
export interface ComplectVariantSmartInfo {
    /** entityTypeId — адресация элементов crm.item.*. */
    entityTypeId: number;
    /** id смарт-типа из crm.type.list — основа UF-имён полей. */
    typeId: number;
    /** Код поля → фактический camel-ключ crm.item. */
    ufKeyByCode: Partial<Record<string, string>>;
}

/**
 * Канонический pbx-сервис смарта «Варианты комплекта».
 *
 * Задача та же, что у собратьев (ЗПР, Презентации): зеркалить поля смарта в
 * PortalDB после установки и резолвить их для записи элементов. Резолв здесь
 * короче: у варианта нет enum-полей и стадийной логики в рантайме —
 * конструктор пишет значения и двигает стадию по коду.
 */
@Injectable()
export class PbxComplectVariantSmartService {
    private readonly logger = new Logger(PbxComplectVariantSmartService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalStoreService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
    ) {}

    /** Сбрасывать нечего: рантайм-кэша у сервиса нет, метод — часть порта. */
    invalidate(domain: string): void {
        this.logger.debug(`invalidate(${domain}): кэша резолва нет`);
    }

    /**
     * Зеркало полей смарта в PortalDB (bitrixfields + items): PortalModel и
     * fallback-резолв видят поля без похода в Bitrix.
     */
    async mirrorFields(
        domain: string,
        /** id смарт-типа из crm.type.list (НЕ entityTypeId). */
        typeId: number,
        bxFields: IUserFieldConfig[],
        /** entityTypeId — для чтения фактических camel-ключей из crm.item.fields. */
        entityTypeId?: number,
    ): Promise<number> {
        const portal = await this.portalStoreService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found (локальная БД)');
        }
        const row = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            COMPLECT_VARIANT_SMART_TYPE,
            COMPLECT_VARIANT_SMART_GROUP,
        );
        if (!row) {
            throw new Error('Строка smarts не найдена (зеркало типа)');
        }

        const camelByNormalized = entityTypeId
            ? await this.loadItemFieldKeys(domain, entityTypeId)
            : {};

        const parentType = `${COMPLECT_VARIANT_SMART_GROUP}_${COMPLECT_VARIANT_SMART_TYPE}`;
        const entities: PbxFieldEntity[] = [];

        for (const def of COMPLECT_VARIANT_SMART_FIELDS) {
            const fieldName = `UF_CRM_${typeId}_${def.code}`;
            const bxField = bxFields.find(
                field => field.fieldName === fieldName,
            );
            if (!bxField) {
                continue;
            }

            const entity = new PbxFieldEntity();
            entity.name = def.name;
            entity.title = def.name;
            entity.code = def.code;
            entity.type = def.type;
            entity.isPlural = bxField.multiple === 'Y';
            entity.bitrixId = fieldName;
            entity.bitrixCamelId =
                camelByNormalized[this.normalizeKey(fieldName)] ??
                buildComplectVariantItemFieldName(typeId, def.code);
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
        this.logger.log(
            `Зеркало полей ${COMPLECT_VARIANT_SMART_TYPE} (${domain}): ${entities.length} полей`,
        );
        return entities.length;
    }

    /**
     * Фактические camel-ключи UF-полей смарта из crm.item.fields.
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

    /** UF_CRM_8_VARIANT_NAME и ufCrm8VariantName → 'ufcrm8variantname'. */
    private normalizeKey(value: string): string {
        return value.replace(/_/g, '').toLowerCase();
    }
}
