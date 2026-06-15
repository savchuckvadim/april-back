import { Injectable } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalSmartService } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseSmartService } from '../parse/parse-smart.service';
import { SmartGroupEnum, SmartNameEnum } from '../../dto/install-smart.dto';

/**
 * Статус поля смарта в трёх слоях. Шаблон — источник истины; «лишнее» в Bitrix
 * (`bitrix_only`) подсвечивается как кандидат на merge Bitrix→DB.
 */
export const SMART_FIELD_STATUS_VALUES = [
    'synced',
    'missing_in_db',
    'missing_in_bitrix',
    'template_only',
    'tracked_no_template',
    'bitrix_only',
    'db_only',
] as const;
export type SmartFieldStatus = (typeof SMART_FIELD_STATUS_VALUES)[number];

export interface SmartFieldMerged {
    code: string;
    template: Field | null;
    p: PbxFieldEntity | null;
    bx: IUserFieldConfig | null;
    status: SmartFieldStatus;
}

export interface SmartComboOverview {
    smartName: SmartNameEnum;
    group: SmartGroupEnum;
    hasTemplate: boolean;
    installedInDb: boolean;
    smartBitrixId: number | null;
    fields: SmartFieldMerged[];
}

export interface SmartPortalOverview {
    domain: string;
    portalId: number;
    smarts: SmartComboOverview[];
}

export interface SmartOverviewResult {
    perPortal: SmartPortalOverview[];
    errors: { domain: string; error: string }[];
}

/**
 * Полная сводка полей смартов: все порталы × все `SmartNameEnum` × все
 * `SmartGroupEnum`, со склейкой шаблон / PortalDB / живой Bitrix по `code`.
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` — берётся локально по
 * domain (правило CLAUDE.md про race condition).
 */
@Injectable()
export class PbxSmartFieldOverviewService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly parseService: ParseSmartService,
    ) {}

    async getAllPortals(): Promise<SmartOverviewResult> {
        const portals = (await this.portalService.getPortals()) ?? [];
        const templateCache = new Map<string, Field[] | null>();
        const perPortal: SmartPortalOverview[] = [];
        const errors: { domain: string; error: string }[] = [];

        for (const portal of portals) {
            const domain = portal.domain;
            if (!domain) continue;
            try {
                perPortal.push(
                    await this.buildPortalOverview(
                        domain,
                        Number(portal.id),
                        templateCache,
                    ),
                );
            } catch (e) {
                errors.push({
                    domain,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
        return { perPortal, errors };
    }

    private async buildPortalOverview(
        domain: string,
        portalId: number,
        templateCache: Map<string, Field[] | null>,
    ): Promise<SmartPortalOverview> {
        const { bitrix } = await this.pbxService.init(domain);
        const smarts: SmartComboOverview[] = [];

        for (const smartName of Object.values(SmartNameEnum)) {
            for (const group of Object.values(SmartGroupEnum)) {
                const template = await this.loadTemplate(
                    smartName,
                    group,
                    templateCache,
                );
                const row = await this.portalSmartService
                    .findFirstByPortalTypeGroup(
                        BigInt(portalId),
                        smartName,
                        group,
                    )
                    .catch(() => null);

                const smartBitrixId = row?.bitrixId
                    ? Number(row.bitrixId)
                    : null;

                let dbFields: PbxFieldEntity[] = [];
                let bxFields: IUserFieldConfig[] = [];
                if (row && smartBitrixId) {
                    dbFields = await this.pbxFieldService.findByEntityId(
                        PbxEntityTypePrisma.SMART,
                        row.id,
                    );
                    bxFields = await bitrix.userFieldConfig.getAll('crm', {
                        entityId: `CRM_${smartBitrixId}`,
                    });
                }

                const fields = this.merge(template, dbFields, bxFields);
                // комбо без шаблона и без установки нигде — пропускаем (шум).
                if (!template && fields.length === 0) continue;

                smarts.push({
                    smartName,
                    group,
                    hasTemplate: !!template,
                    installedInDb: !!row,
                    smartBitrixId,
                    fields,
                });
            }
        }
        return { domain, portalId, smarts };
    }

    private async loadTemplate(
        smartName: SmartNameEnum,
        group: SmartGroupEnum,
        cache: Map<string, Field[] | null>,
    ): Promise<Field[] | null> {
        const key = `${smartName}:${group}`;
        if (cache.has(key)) return cache.get(key) ?? null;
        let template: Field[] | null = null;
        try {
            const parsed = await this.parseService.getParsedData(
                smartName,
                group,
            );
            template = parsed[0]?.fields ?? null;
        } catch {
            template = null;
        }
        cache.set(key, template);
        return template;
    }

    private merge(
        template: Field[] | null,
        db: PbxFieldEntity[],
        bx: IUserFieldConfig[],
    ): SmartFieldMerged[] {
        const byCode = new Map<string, SmartFieldMerged>();
        const ensure = (code: string): SmartFieldMerged => {
            let e = byCode.get(code);
            if (!e) {
                e = {
                    code,
                    template: null,
                    p: null,
                    bx: null,
                    status: 'synced',
                };
                byCode.set(code, e);
            }
            return e;
        };

        for (const t of template ?? []) ensure(t.code).template = t;
        for (const d of db) ensure(d.code).p = d;
        for (const b of bx) {
            const code =
                b.xmlId && b.xmlId.length
                    ? b.xmlId
                    : (db.find(d => d.bitrixId === b.fieldName)?.code ??
                      b.fieldName);
            ensure(code).bx = b;
        }

        for (const e of byCode.values()) e.status = this.status(e);
        return [...byCode.values()];
    }

    private status(e: SmartFieldMerged): SmartFieldStatus {
        const hasT = !!e.template;
        const hasDb = !!e.p;
        const hasBx = !!e.bx;
        if (hasT) {
            if (hasDb && hasBx) return 'synced';
            if (hasDb) return 'missing_in_bitrix';
            if (hasBx) return 'missing_in_db';
            return 'template_only';
        }
        if (hasDb && hasBx) return 'tracked_no_template';
        if (hasBx) return 'bitrix_only';
        return 'db_only';
    }
}
