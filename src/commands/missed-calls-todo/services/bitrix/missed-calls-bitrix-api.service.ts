import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import {
    BxActivityCall,
    EntityInfo,
    EntityRef,
    ResponsibleMessageItem,
    TodoCreateItem,
} from '../../interfaces/missed-call.types';

const METHOD_COMPANY_GET = 'crm.company.get';
const METHOD_LEAD_GET = 'crm.lead.get';
const OWNER_TYPE_COMPANY = Number(BitrixOwnerTypeId.COMPANY);
const OWNER_TYPE_LEAD = Number(BitrixOwnerTypeId.LEAD);

@Injectable()
export class MissedCallsBitrixApiService {
    constructor(private readonly pbx: PBXService) {}

    async listMissedCalls(
        domain: string,
        sinceIso: string,
    ): Promise<BxActivityCall[]> {
        const { bitrix } = await this.pbx.init(domain);
        const response = await bitrix.activity.getList(
            {
                TYPE_ID: 2,
                PROVIDER_ID: 'VOXIMPLANT_CALL',
                DIRECTION: 2,
                COMPLETED: 'N',
                '>START_TIME': sinceIso,
            },
            [
                'ID',
                'OWNER_TYPE_ID',
                'OWNER_ID',
                'SUBJECT',
                'START_TIME',
                'RESPONSIBLE_ID',
                'COMPLETED',
                'DIRECTION',
                'PROVIDER_ID',
                'STATUS',
            ],
        );

        return (response?.result || []) as BxActivityCall[];
    }

    async loadEntities(
        domain: string,
        refs: EntityRef[],
    ): Promise<Map<string, EntityInfo>> {
        const { bitrix } = await this.pbx.init(domain);
        const uniqueKeys = new Set<string>();
        for (const ref of refs) {
            uniqueKeys.add(this.entityKey(ref.ownerTypeId, ref.ownerId));
        }

        for (const key of uniqueKeys) {
            const [ownerTypeRaw, ownerIdRaw] = key.split(':');
            const ownerTypeId = Number(ownerTypeRaw);
            const ownerId = Number(ownerIdRaw);
            if (ownerTypeId === OWNER_TYPE_COMPANY) {
                bitrix.api.addCmdBatch(`cmp_${ownerId}`, METHOD_COMPANY_GET, {
                    id: ownerId,
                });
            } else if (ownerTypeId === OWNER_TYPE_LEAD) {
                bitrix.api.addCmdBatch(`lead_${ownerId}`, METHOD_LEAD_GET, {
                    id: ownerId,
                });
            }
        }

        const batches = await bitrix.api.callBatchWithConcurrency(2);
        const map = new Map<string, EntityInfo>();

        for (const batch of batches) {
            for (const [key, value] of Object.entries(batch.result || {})) {
                const item = value as Record<string, unknown>;
                if (key.startsWith('cmp_')) {
                    const ownerId = Number(key.replace('cmp_', ''));
                    const responsibleId = this.toStringValue(
                        item.ASSIGNED_BY_ID,
                    );
                    if (!responsibleId) continue;
                    map.set(this.entityKey(OWNER_TYPE_COMPANY, ownerId), {
                        ownerTypeId: OWNER_TYPE_COMPANY,
                        ownerId,
                        responsibleId,
                        title:
                            this.toStringValue(item.TITLE) ||
                            `Компания ${ownerId}`,
                    });
                }
                if (key.startsWith('lead_')) {
                    const ownerId = Number(key.replace('lead_', ''));
                    const responsibleId = this.toStringValue(
                        item.ASSIGNED_BY_ID,
                    );
                    if (!responsibleId) continue;
                    map.set(this.entityKey(OWNER_TYPE_LEAD, ownerId), {
                        ownerTypeId: OWNER_TYPE_LEAD,
                        ownerId,
                        responsibleId,
                        title:
                            this.toStringValue(item.TITLE) || `Лид ${ownerId}`,
                    });
                }
            }
        }

        return map;
    }

    async createTodosBatch(
        domain: string,
        items: TodoCreateItem[],
    ): Promise<void> {
        if (items.length === 0) return;
        const { bitrix } = await this.pbx.init(domain);
        const activityTodoBatch = bitrix.batch.activityTodo as {
            add(
                cmdCode: string,
                data: {
                    ownerTypeId: number;
                    ownerId: number;
                    responsibleId: number;
                    description: string;
                },
            ): unknown;
        };
        let index = 0;
        for (const item of items) {
            index += 1;
            activityTodoBatch.add(`todo_${index}`, {
                ownerTypeId: item.ownerTypeId,
                ownerId: item.ownerId,
                // responsibleId: Number(item.responsibleId),
                responsibleId: 2153,
                description: item.description,
            });
        }
        await bitrix.api.callBatchWithConcurrency(2);
    }

    async sendResponsibleMessagesBatch(
        domain: string,
        items: ResponsibleMessageItem[],
    ): Promise<void> {
        if (items.length === 0) return;
        const { bitrix } = await this.pbx.init(domain);
        let index = 0;
        for (const item of items) {
            index += 1;
            bitrix.batch.message.add(`im_${index}`, {
                DIALOG_ID: item.responsibleId,
                MESSAGE: item.message,
                SYSTEM: 'N',
                URL_PREVIEW: 'N',
            });
        }
        await bitrix.api.callBatchWithConcurrency(2);
    }

    private entityKey(ownerTypeId: number, ownerId: number): string {
        return `${ownerTypeId}:${ownerId}`;
    }

    private toStringValue(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return '';
    }
}
