import { Injectable, Logger } from '@nestjs/common';
import { PbxEntityAccessorService } from '@/modules/pbx-registry';
import { PbxEntityContext } from '@/modules/pbx-registry/services/pbx-entity-accessor.service';
import { PBXService } from '@/modules/pbx';
import { PbxEntityType } from '@/shared/enums';

export interface TestReadOptions {
    domain: string;
    entityType: string;
    entityCode?: string;
    entityId?: number;
}

export interface TestWriteOptions {
    domain: string;
    entityType: string;
    entityId: number;
    values: Record<string, unknown>;
}

@Injectable()
export class PbxTestService {
    private readonly logger = new Logger(PbxTestService.name);

    constructor(
        private readonly accessor: PbxEntityAccessorService,
        private readonly pbx: PBXService,
    ) {}

    async testRead(options: TestReadOptions) {
        const { bitrix, portal } = await this.pbx.init(options.domain);
        const portalId = BigInt(portal.id ?? 0);
        const entityType = options.entityType as PbxEntityType;

        const ctx = await this.resolveContext(
            portalId,
            entityType,
            options.entityCode,
        );

        if (!ctx) {
            return {
                error: 'Context not resolved',
                entityType,
                domain: options.domain,
            };
        }

        const contextInfo = this.buildContextInfo(ctx);

        if (!options.entityId) {
            return {
                context: contextInfo,
                message: 'No entityId — context only',
            };
        }

        const record = await this.fetchBitrixRecord(
            bitrix,
            entityType,
            options.entityId,
        );

        if ('error' in record) {
            return { context: contextInfo, error: record.error };
        }

        const extracted = ctx.extractValues(record.data);

        return {
            context: contextInfo,
            entityId: options.entityId,
            extractedValues: extracted,
        };
    }

    async testWrite(options: TestWriteOptions) {
        const { bitrix, portal } = await this.pbx.init(options.domain);
        const portalId = BigInt(portal.id ?? 0);
        const entityType = options.entityType as PbxEntityType;

        const ctx = await this.accessor.forEntity(
            portalId,
            entityType,
            portalId,
        );

        const payload = ctx.buildPayload(options.values);

        const resolvedFields = Object.entries(options.values).map(
            ([code, value]) => ({
                code,
                bitrixKey: ctx.fieldKey(code),
                resolved: ctx.hasField(code),
                value,
            }),
        );

        try {
            const writeResult = await this.writeBitrixRecord(
                bitrix,
                entityType,
                options.entityId,
                payload,
            );
            return { payload, resolvedFields, writeResult };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.logger.error(`Bitrix write error: ${message}`);
            return {
                payload,
                resolvedFields,
                error: `Bitrix API error: ${message}`,
            };
        }
    }

    private async resolveContext(
        portalId: bigint,
        entityType: PbxEntityType,
        entityCode?: string,
    ): Promise<PbxEntityContext | null> {
        if (entityType === 'smart' && entityCode) {
            return this.accessor.forSmart(portalId, entityCode);
        }
        if (entityType === 'rpa' && entityCode) {
            return this.accessor.forRpa(portalId, entityCode);
        }
        return this.accessor.forEntity(portalId, entityType, portalId);
    }

    private buildContextInfo(ctx: PbxEntityContext) {
        const selectKeys = ctx.allSelectKeys();
        return {
            entityType: ctx.entityType,
            fieldsCount: selectKeys.length,
            sampleFields: selectKeys.slice(0, 10),
            fieldKeys: Object.fromEntries(
                selectKeys.slice(0, 10).map(k => [k, ctx.fieldKey(k) || 'N/A']),
            ),
        };
    }

    private async fetchBitrixRecord(
        bitrix: any,
        entityType: PbxEntityType,
        entityId: number,
    ): Promise<{ data: Record<string, unknown> } | { error: string }> {
        try {
            let record: Record<string, unknown> | null = null;

            if (entityType === PbxEntityType.DEAL) {
                const resp = await bitrix.deal.get(entityId);
                record = resp?.result ?? null;
            } else if (entityType === PbxEntityType.BTX_COMPANY) {
                const resp = await bitrix.api.call('crm.company.get', {
                    ID: entityId,
                });
                record =
                    ((resp as Record<string, unknown>)?.result as Record<
                        string,
                        unknown
                    >) ?? null;
            } else if (entityType === PbxEntityType.LEAD) {
                const resp = await bitrix.api.call('crm.lead.get', {
                    ID: entityId,
                });
                record =
                    ((resp as Record<string, unknown>)?.result as Record<
                        string,
                        unknown
                    >) ?? null;
            }

            if (!record) return { error: 'Entity not found' };
            return { data: record };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { error: `Bitrix API error: ${message}` };
        }
    }

    private async writeBitrixRecord(
        bitrix: any,
        entityType: PbxEntityType,
        entityId: number,
        payload: Record<string, unknown>,
    ): Promise<unknown> {
        if (entityType === PbxEntityType.DEAL) {
            return bitrix.deal.update(
                entityId,
                payload as Record<string, string | number | boolean>,
            );
        }
        if (entityType === PbxEntityType.BTX_COMPANY) {
            return bitrix.api.call('crm.company.update', {
                ID: entityId,
                FIELDS: payload,
            });
        }
        if (entityType === PbxEntityType.LEAD) {
            return bitrix.api.call('crm.lead.update', {
                ID: entityId,
                FIELDS: payload,
            });
        }
        return null;
    }
}
