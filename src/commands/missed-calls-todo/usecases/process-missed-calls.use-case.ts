import { Injectable, Logger } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { MissedCallsConfigService } from '../services/config/missed-calls-config.service';
import { MissedCallsStateService } from '../services/state/missed-calls-state.service';
import { MissedCallsBitrixApiService } from '../services/bitrix/missed-calls-bitrix-api.service';
import {
    BxActivityCall,
    ResponsibleMessageItem,
    TodoCreateItem,
} from '../interfaces/missed-call.types';

const OWNER_TYPE_COMPANY = Number(BitrixOwnerTypeId.COMPANY);
const OWNER_TYPE_LEAD = Number(BitrixOwnerTypeId.LEAD);

@Injectable()
export class ProcessMissedCallsUseCase {
    private readonly logger = new Logger(ProcessMissedCallsUseCase.name);

    constructor(
        private readonly config: MissedCallsConfigService,
        private readonly state: MissedCallsStateService,
        private readonly bitrixApi: MissedCallsBitrixApiService,
    ) {}

    async execute(): Promise<{
        skipped: boolean;
        reason?: string;
        callsChecked: number;
        todosCreated: number;
        usersNotified: number;
    }> {
        if (!this.config.isSchedulerEnabled()) {
            return {
                skipped: true,
                reason: 'WITH_SCHEDLER is disabled',
                callsChecked: 0,
                todosCreated: 0,
                usersNotified: 0,
            };
        }

        const domain = this.config.getPortalDomain();
        const since = await this.resolveSince(domain);
        const calls = await this.bitrixApi.listMissedCalls(domain, since);
        const relevantCalls = await this.filterRelevantCalls(domain, calls);
        if (relevantCalls.length === 0) {
            await this.state.setLastCheckAt(domain, new Date().toISOString());
            return {
                skipped: false,
                callsChecked: calls.length,
                todosCreated: 0,
                usersNotified: 0,
            };
        }

        const refs = relevantCalls.map(call => ({
            ownerTypeId: Number(call.OWNER_TYPE_ID),
            ownerId: Number(call.OWNER_ID),
        }));
        const entities = await this.bitrixApi.loadEntities(domain, refs);
        const todos = this.buildTodos(relevantCalls, entities);
        const messages = this.buildMessages(relevantCalls, entities);

        await this.bitrixApi.createTodosBatch(domain, todos);
        await this.bitrixApi.sendResponsibleMessagesBatch(domain, messages);
        await this.state.setLastCheckAt(domain, new Date().toISOString());

        return {
            skipped: false,
            callsChecked: calls.length,
            todosCreated: todos.length,
            usersNotified: messages.length,
        };
    }

    private async resolveSince(domain: string): Promise<string> {
        const previous = await this.state.getLastCheckAt(domain);
        if (previous) {
            return previous;
        }
        const date = new Date(
            Date.now() - this.config.getLookbackMinutes() * 60000,
        );
        return date.toISOString();
    }

    private async filterRelevantCalls(
        domain: string,
        calls: BxActivityCall[],
    ): Promise<BxActivityCall[]> {
        const result: BxActivityCall[] = [];
        for (const call of calls) {
            const activityId = String(call.ID ?? '');
            if (!activityId) continue;
            if (!this.isCallLinkedToCompanyOrLead(call)) continue;
            if (!this.isMissedIncomingCall(call)) continue;

            const isNew = await this.state.markActivityIfNew(
                domain,
                activityId,
            );
            if (!isNew) continue;
            result.push(call);
        }
        return result;
    }

    private isCallLinkedToCompanyOrLead(call: BxActivityCall): boolean {
        const ownerTypeId = Number(call.OWNER_TYPE_ID);
        return (
            ownerTypeId === OWNER_TYPE_COMPANY ||
            ownerTypeId === OWNER_TYPE_LEAD
        );
    }

    private isMissedIncomingCall(call: BxActivityCall): boolean {
        const direction = Number(call.DIRECTION ?? 0);
        const completed = String(call.COMPLETED ?? 'N');
        const status = Number(call.STATUS ?? 0);
        const provider = String(call.PROVIDER_ID ?? '');

        if (provider && provider !== 'VOXIMPLANT_CALL') return false;
        if (direction !== 2) return false;
        if (completed === 'Y') return false;
        // STATUS=2 usually indicates a completed successful call in activity records.
        if (status === 2) return false;
        return true;
    }

    private buildTodos(
        calls: BxActivityCall[],
        entities: Map<string, { title: string; responsibleId: string }>,
    ): TodoCreateItem[] {
        const result: TodoCreateItem[] = [];
        for (const call of calls) {
            const ownerTypeId = Number(call.OWNER_TYPE_ID);
            const ownerId = Number(call.OWNER_ID);
            const key = this.entityKey(ownerTypeId, ownerId);
            const entity = entities.get(key);
            if (!entity) continue;

            result.push({
                ownerTypeId,
                ownerId,
                responsibleId: entity.responsibleId,
                description: `У вас пропущенный звонок по сущности "${entity.title}".`,
            });
        }
        return result;
    }

    private buildMessages(
        calls: BxActivityCall[],
        entities: Map<string, { title: string; responsibleId: string }>,
    ): ResponsibleMessageItem[] {
        const byResponsible = new Map<string, Set<string>>();
        for (const call of calls) {
            const ownerTypeId = Number(call.OWNER_TYPE_ID);
            const ownerId = Number(call.OWNER_ID);
            const key = this.entityKey(ownerTypeId, ownerId);
            const entity = entities.get(key);
            if (!entity) continue;

            if (!byResponsible.has(entity.responsibleId)) {
                byResponsible.set(entity.responsibleId, new Set<string>());
            }
            byResponsible.get(entity.responsibleId)?.add(entity.title);
        }

        const result: ResponsibleMessageItem[] = [];
        for (const [responsibleId, titlesSet] of byResponsible.entries()) {
            const titles = Array.from(titlesSet).map(title => `- ${title}`);
            result.push({
                responsibleId,
                message: [
                    '[B]У вас есть пропущенные звонки:[/B]',
                    ...titles,
                    '',
                    'Созданы задачи в CRM timeline.',
                ].join('\n'),
            });
        }
        return result;
    }

    private entityKey(ownerTypeId: number, ownerId: number): string {
        return `${ownerTypeId}:${ownerId}`;
    }
}
