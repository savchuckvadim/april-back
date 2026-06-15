import { Injectable } from '@nestjs/common';
import { IUserFieldConfig } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PbxFieldEntity, PbxFieldService } from '@lib/portal-lib/pbx-domain';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';
import { ParseRpaService } from '../parse/parse-rpa.service';
import { RpaGroupEnum, RpaNameEnum } from '../../dto/install-rpa.dto';

/**
 * Статус поля RPA в трёх слоях. Шаблон — источник истины; «лишнее» в Bitrix
 * (`bitrix_only`) подсвечивается как кандидат на merge Bitrix→DB.
 */
export const RPA_FIELD_STATUS_VALUES = [
    'synced',
    'missing_in_db',
    'missing_in_bitrix',
    'template_only',
    'tracked_no_template',
    'bitrix_only',
    'db_only',
] as const;
export type RpaFieldStatus = (typeof RPA_FIELD_STATUS_VALUES)[number];

export interface RpaFieldMerged {
    code: string;
    template: Field | null;
    p: PbxFieldEntity | null;
    bx: IUserFieldConfig | null;
    status: RpaFieldStatus;
}

export interface RpaComboOverview {
    rpaName: RpaNameEnum;
    group: RpaGroupEnum;
    hasTemplate: boolean;
    installedInDb: boolean;
    rpaTypeId: number | null;
    fields: RpaFieldMerged[];
}

export interface RpaPortalOverview {
    domain: string;
    portalId: number;
    rpa: RpaComboOverview[];
}

export interface RpaOverviewResult {
    perPortal: RpaPortalOverview[];
    errors: { domain: string; error: string }[];
}

/**
 * Полная сводка полей RPA: все порталы × все `RpaNameEnum` × все `RpaGroupEnum`,
 * со склейкой шаблон / PortalDB / живой Bitrix по `code`.
 *
 * `@Injectable`, но Bitrix-инстанс не хранится в `this` — берётся локально по
 * domain (правило CLAUDE.md про race condition).
 */
@Injectable()
export class PbxRpaFieldOverviewService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRpaService: PortalRpaService,
        private readonly pbxFieldService: PbxFieldService,
        private readonly parseService: ParseRpaService,
    ) {}

    async getAllPortals(): Promise<RpaOverviewResult> {
        const portals = (await this.portalService.getPortals()) ?? [];
        const templateCache = new Map<string, Field[] | null>();
        const perPortal: RpaPortalOverview[] = [];
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
    ): Promise<RpaPortalOverview> {
        const { bitrix } = await this.pbxService.init(domain);
        const rpa: RpaComboOverview[] = [];

        for (const rpaName of Object.values(RpaNameEnum)) {
            const row = await this.portalRpaService
                .findFirstByPortalAndCode(BigInt(portalId), rpaName)
                .catch(() => null);
            const rpaTypeId = row?.typeId ? Number(row.typeId) : null;

            let dbFields: PbxFieldEntity[] = [];
            let bxFields: IUserFieldConfig[] = [];
            if (row && rpaTypeId) {
                dbFields = await this.pbxFieldService.findByEntityId(
                    PbxEntityTypePrisma.BTX_RPA,
                    row.id,
                );
                bxFields = await bitrix.userFieldConfig.getAll('rpa', {
                    entityId: `RPA_${rpaTypeId}`,
                });
            }

            for (const group of Object.values(RpaGroupEnum)) {
                const template = await this.loadTemplate(
                    rpaName,
                    group,
                    templateCache,
                );
                const fields = this.merge(template, dbFields, bxFields);
                // комбо без шаблона и без установки нигде — пропускаем (шум).
                if (!template && fields.length === 0) continue;

                rpa.push({
                    rpaName,
                    group,
                    hasTemplate: !!template,
                    installedInDb: !!row,
                    rpaTypeId,
                    fields,
                });
            }
        }
        return { domain, portalId, rpa };
    }

    private async loadTemplate(
        rpaName: RpaNameEnum,
        group: RpaGroupEnum,
        cache: Map<string, Field[] | null>,
    ): Promise<Field[] | null> {
        const key = `${rpaName}:${group}`;
        if (cache.has(key)) return cache.get(key) ?? null;
        let template: Field[] | null = null;
        try {
            const parsed = await this.parseService.getParsedData(
                rpaName,
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
    ): RpaFieldMerged[] {
        const byCode = new Map<string, RpaFieldMerged>();
        const ensure = (code: string): RpaFieldMerged => {
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

    private status(e: RpaFieldMerged): RpaFieldStatus {
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
