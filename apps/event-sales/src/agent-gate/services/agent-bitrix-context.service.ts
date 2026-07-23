import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { TranscriptionPipelineView } from '@lib/call-lib';

/** Активные сделки компании по воронкам ОП — кандидаты для связей. */
export interface AgentDealCandidates {
    salesBase: Record<string, unknown>[];
    salesPresentation: Record<string, unknown>[];
    salesXo: Record<string, unknown>[];
}

/** Bitrix-контекст пакета звонка (для глубокого анализа агентом). */
export interface AgentBitrixContext {
    deal: Record<string, unknown> | null;
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
 * сделка/компания/контакт, кандидаты записей отчётности (sales_history /
 * sales_kpi в окне ±N дней), активные сделки воронок ОП и словарь
 * pbx-полей компании. Семантическую привязку кандидатов делает агент.
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
            company: null,
            contact: null,
            historyCandidates: [],
            kpiCandidates: [],
            dealCandidates: {
                salesBase: [],
                salesPresentation: [],
                salesXo: [],
            },
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

        const deal = (await this.callRaw(bitrix.api, 'crm.deal.get', {
            id: row.entityId,
        })) as Record<string, unknown> | null;

        const companyId = this.idToString(deal?.COMPANY_ID);
        const contactId = this.idToString(deal?.CONTACT_ID);

        const company =
            companyId && companyId !== '0'
                ? ((await this.callRaw(bitrix.api, 'crm.company.get', {
                      id: companyId,
                  })) as Record<string, unknown> | null)
                : null;
        const contact =
            contactId && contactId !== '0'
                ? ((await this.callRaw(bitrix.api, 'crm.contact.get', {
                      id: contactId,
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
        const dealCandidates = await this.loadDealCandidates(
            bitrix,
            portalModel,
            companyId,
            row,
        );
        const companyFields = this.buildCompanyFieldsDictionary(portalModel);

        return {
            deal,
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
     * Активные сделки компании по воронкам ОП (sales_base /
     * sales_presentation / sales_xo) — кандидаты для связей
     * DEAL_MAIN/DEAL_PRESENTATION/DEAL_XO.
     */
    private async loadDealCandidates(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        portalModel: Awaited<ReturnType<PBXService['init']>>['PortalModel'],
        companyId: string | null,
        row: TranscriptionPipelineView,
    ): Promise<AgentDealCandidates> {
        const empty: AgentDealCandidates = {
            salesBase: [],
            salesPresentation: [],
            salesXo: [],
        };
        if (!companyId || companyId === '0') return empty;
        try {
            const response = await bitrix.deal.getList(
                { COMPANY_ID: companyId } as never,
                [
                    'ID',
                    'TITLE',
                    'CATEGORY_ID',
                    'STAGE_ID',
                    'CLOSED',
                    'ASSIGNED_BY_ID',
                ],
            );
            const deals = (response.result ?? []) as unknown as Record<
                string,
                unknown
            >[];
            const active = deals.filter(deal => deal.CLOSED !== 'Y');

            const categories = portalModel.getDealCategories() ?? [];
            const byCode = (code: string) =>
                active.filter(deal => {
                    const category = categories.find(
                        c => String(c.bitrixId) === String(deal.CATEGORY_ID),
                    );
                    return category?.code === code;
                });

            return {
                salesBase: byCode('sales_base'),
                salesPresentation: byCode('sales_presentation'),
                salesXo: byCode('sales_xo'),
            };
        } catch (error) {
            this.logger.warn(
                `Сделки-кандидаты не собраны (${row.domain}): ${(error as Error).message}`,
            );
            return empty;
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
        if (typeof value === 'string' && value) return value;
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
