import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { TranscriptionPipelineView } from '@lib/call-lib';
import {
    AgentCallClient,
    AgentDealCandidates,
    AgentDealCandidatesLoader,
} from './agent-deal-candidates.loader';

export {
    AgentCallClient,
    AgentDealCandidates,
} from './agent-deal-candidates.loader';

/** Bitrix-контекст пакета звонка (для глубокого анализа агентом). */
export interface AgentBitrixContext {
    /** Сделка-владелец звонка; null — звонок по лиду или сделка не прочитана. */
    deal: Record<string, unknown> | null;
    /** Лид-владелец звонка; null — звонок по сделке. */
    lead: Record<string, unknown> | null;
    company: Record<string, unknown> | null;
    contact: Record<string, unknown> | null;
    historyCandidates: Record<string, unknown>[];
    kpiCandidates: Record<string, unknown>[];
    dealCandidates: AgentDealCandidates;
    companyFields: Record<string, unknown>[];
}

/** Окно поиска кандидатов sales_history вокруг звонка, дней. */
const HISTORY_WINDOW_DAYS = 14;
const HISTORY_CANDIDATES_LIMIT = 30;

/**
 * Сборка Bitrix-контекста звонка для пакета агента — вынесено из
 * AgentCallPackageService (одна ответственность: походы в Bitrix):
 * сделка ИЛИ лид владельца звонка, компания/контакт, кандидаты записей
 * отчётности (sales_history / sales_kpi в окне ±N дней), сделки клиента по
 * воронкам ОП (AgentDealCandidatesLoader) и словарь pbx-полей компании.
 * Семантическую привязку кандидатов делает агент.
 *
 * Все шаги мягкие: недоступность Bitrix отдаёт пустой контекст/куски —
 * пакет звонка важнее полноты контекста.
 */
@Injectable()
export class AgentBitrixContextService {
    private readonly logger = new Logger(AgentBitrixContextService.name);

    constructor(private readonly pbxService: PBXService) {}

    /** Пустой контекст (используется и как fallback при ошибках). */
    empty(): AgentBitrixContext {
        return {
            deal: null,
            lead: null,
            company: null,
            contact: null,
            historyCandidates: [],
            kpiCandidates: [],
            dealCandidates: AgentDealCandidatesLoader.empty(),
            companyFields: [],
        };
    }

    async load(row: TranscriptionPipelineView): Promise<AgentBitrixContext> {
        if (!row.domain || !row.entityId) {
            return this.empty();
        }

        const { bitrix, PortalModel: portalModel } = await this.pbxService.init(
            row.domain,
        );

        // ТИП СУЩНОСТИ РЕШАЕТ, ЧТО ЧИТАТЬ (приёмка 08.09.2026): раньше
        // crm.deal.get звался с entityId ЛЮБОЙ сущности, и звонок по лиду
        // #900 подтягивал ЧУЖУЮ сделку #900 — вместе с её компанией,
        // контактом и кандидатами.
        const isLead = row.entityType === 'lead';
        const owner = (await this.callRaw(
            bitrix.api,
            isLead ? 'crm.lead.get' : 'crm.deal.get',
            { id: row.entityId },
        )) as Record<string, unknown> | null;

        const client: AgentCallClient = {
            companyId: this.idToString(owner?.COMPANY_ID),
            contactId: this.idToString(owner?.CONTACT_ID),
        };

        const company = client.companyId
            ? ((await this.callRaw(bitrix.api, 'crm.company.get', {
                  id: client.companyId,
              })) as Record<string, unknown> | null)
            : null;
        const contact = client.contactId
            ? ((await this.callRaw(bitrix.api, 'crm.contact.get', {
                  id: client.contactId,
              })) as Record<string, unknown> | null)
            : null;

        const historyCandidates = await this.loadListCandidates(
            bitrix,
            portalModel,
            'sales_history',
            row,
        );
        const kpiCandidates = await this.loadListCandidates(
            bitrix,
            portalModel,
            'sales_kpi',
            row,
        );
        // Сделки клиента по воронкам ОП — включая ЗАКРЫТЫЕ и по контакту.
        const dealCandidates = await new AgentDealCandidatesLoader(
            bitrix,
            portalModel,
            this.logger,
        ).load(client);
        const companyFields = this.buildCompanyFieldsDictionary(portalModel);

        return {
            deal: isLead ? null : owner,
            lead: isLead ? owner : null,
            company,
            contact,
            historyCandidates,
            kpiCandidates,
            dealCandidates,
            companyFields,
        };
    }

    /**
     * Кандидаты записей отчётов менеджера из списка (sales_history /
     * sales_kpi) в окне ±HISTORY_WINDOW_DAYS вокруг звонка.
     */
    private async loadListCandidates(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
        listCode: 'sales_history' | 'sales_kpi',
        row: TranscriptionPipelineView,
    ): Promise<Record<string, unknown>[]> {
        try {
            const list = portalModel.getListByCode(listCode);
            if (!list?.bitrixId) return [];

            const centerDate = row.callStartedAt ?? row.createdAt ?? new Date();
            const from = new Date(
                centerDate.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60_000,
            );
            const to = new Date(
                centerDate.getTime() + HISTORY_WINDOW_DAYS * 24 * 60 * 60_000,
            );

            const response = (await bitrix.listItem.get({
                IBLOCK_ID: String(list.bitrixId),
                filter: {
                    '>=DATE_CREATE': from.toISOString(),
                    '<=DATE_CREATE': to.toISOString(),
                },
            })) as unknown as { result?: Record<string, unknown>[] };

            return (response.result ?? []).slice(0, HISTORY_CANDIDATES_LIMIT);
        } catch (error) {
            this.logger.warn(
                `${listCode} кандидаты не собраны (${row.domain}): ${(error as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Словарь pbx-полей компании портала: код → UF-имя + элементы enum —
     * для расшифровки сырых UF_CRM_* значений компании агентом.
     */
    private buildCompanyFieldsDictionary(
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
    ): Record<string, unknown>[] {
        try {
            return (portalModel.getCompanyFields() ?? []).map(field => ({
                code: field.code,
                ufId: `UF_CRM_${field.bitrixId}`,
                items: (field.items ?? []).map(item => ({
                    code: item.code,
                    bitrixId: item.bitrixId,
                })),
            }));
        } catch (error) {
            this.logger.warn(
                `Словарь полей компании не собран: ${(error as Error).message}`,
            );
            return [];
        }
    }

    /** Приводит сырое поле Bitrix к строковому id (числа/строки, иначе null). */
    private idToString(value: unknown): string | null {
        if (typeof value === 'string' && value && value !== '0') return value;
        if (typeof value === 'number' && value) return String(value);
        return null;
    }

    private async callRaw(
        api: {
            call(
                method: string,
                data: Record<string, unknown>,
            ): Promise<unknown>;
        },
        method: string,
        data: Record<string, unknown>,
    ): Promise<unknown> {
        try {
            const response = (await api.call(method, data)) as {
                result?: unknown;
            };
            return response?.result ?? null;
        } catch (error) {
            this.logger.warn(
                `${method} не выполнен: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
