import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AiEntityDto,
    AiService,
    CALL_REPORT_TYPE_PROFILES,
    CallReportCallTypeCode,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import {
    AgentAiResultDto,
    AgentCallPackageDto,
    AgentCallTypeProfileDto,
    AgentPendingCallDto,
} from '../dto/agent-response.dto';

/** Тип ais-записи, которой агент помечает свой анализ (intake). */
export const AGENT_ANALYSIS_TYPE = 'agent-analysis';

/** Тип ais-записи дешёвой классификации конвейера (call-report pipeline). */
export const CALL_CLASSIFY_TYPE = 'call-classify';

/** Активные сделки компании по воронкам ОП — кандидаты для связей. */
export interface AgentDealCandidates {
    salesBase: Record<string, unknown>[];
    salesPresentation: Record<string, unknown>[];
    salesXo: Record<string, unknown>[];
}

/** Bitrix-контекст пакета звонка. */
interface AgentBitrixContext {
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
 * Сборка данных для внешнего агента-аналитика:
 * список ожидающих звонков и полный пакет по звонку (транскрипт,
 * первичные AI-анализы, связанные сущности Bitrix, кандидаты записей
 * отчётов из sales_history).
 */
@Injectable()
export class AgentCallPackageService {
    private readonly logger = new Logger(AgentCallPackageService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly pbxService: PBXService,
    ) {}

    /**
     * Звонки автоконвейера со статусом done без анализа агента,
     * с учётом доменной изоляции ключа (allowedDomains).
     */
    async listPendingScoped(
        domainQuery: string | undefined,
        limit: number,
        allowedDomains: string[] | null,
    ): Promise<AgentPendingCallDto[]> {
        if (!allowedDomains) {
            return this.listPending(domainQuery, limit);
        }
        if (domainQuery) {
            this.assertDomainAllowed(domainQuery, allowedDomains);
            return this.listPending(domainQuery, limit);
        }
        // Ключ ограничен списком порталов, домен не указан — обходим все свои.
        const pending: AgentPendingCallDto[] = [];
        for (const domain of allowedDomains) {
            if (pending.length >= limit) break;
            pending.push(
                ...(await this.listPending(domain, limit - pending.length)),
            );
        }
        return this.sortPending(pending).slice(0, limit);
    }

    /** Проверка доменной изоляции; чужой домен — 403. */
    assertDomainAllowed(
        domain: string | null | undefined,
        allowedDomains: string[] | null,
    ): void {
        if (!allowedDomains) return;
        if (!domain || !allowedDomains.includes(domain.toLowerCase())) {
            throw new ForbiddenException(
                'Домен вне разрешённых для этого ключа агента',
            );
        }
    }

    /**
     * Звонки автоконвейера со статусом done без анализа агента.
     *
     * Обход keyset-курсором от новых к старым: проанализированные строки
     * остаются в статусе done, поэтому простое окно «новейшие N» навсегда
     * прятало бы старый backlog за свежими разобранными звонками.
     */
    async listPending(
        domain: string | undefined,
        limit: number,
    ): Promise<AgentPendingCallDto[]> {
        const BATCH = 100;
        const MAX_BATCHES = 20;
        const pending: AgentPendingCallDto[] = [];
        let beforeId: string | undefined;

        for (let i = 0; i < MAX_BATCHES && pending.length < limit; i++) {
            const rows = await this.transcriptionStore.findDonePipeline(
                domain,
                BATCH,
                beforeId,
            );
            if (!rows.length) break;
            beforeId = rows[rows.length - 1].id;

            const agentRecords = await this.aiService.findByTranscriptionIds(
                rows.map(row => row.id),
            );
            const analyzedIds = new Set(
                agentRecords
                    .filter(record => record.type === AGENT_ANALYSIS_TYPE)
                    .map(record => String(record.transcription_id)),
            );
            // Тип звонка от дешёвого классификатора конвейера — для
            // группировки ночного батча агента по (domain, callType).
            const callTypes = new Map<string, string>(
                agentRecords
                    .filter(
                        record =>
                            record.type === CALL_CLASSIFY_TYPE && record.result,
                    )
                    .map(record => [
                        String(record.transcription_id),
                        String(record.result),
                    ]),
            );

            for (const row of rows) {
                if (analyzedIds.has(row.id)) continue;
                pending.push(
                    this.toPendingDto(row, false, callTypes.get(row.id)),
                );
                if (pending.length >= limit) break;
            }

            if (rows.length < BATCH) break;
        }

        return this.sortPending(pending);
    }

    /**
     * Сортировка pending по (domain, callType): звонки одного типа идут
     * подряд — методология типа в промпте агента переиспользуется из кэша
     * (prompt caching), неклассифицированные — в конце группы домена.
     */
    private sortPending(pending: AgentPendingCallDto[]): AgentPendingCallDto[] {
        return [...pending].sort(
            (a, b) =>
                a.domain.localeCompare(b.domain) ||
                (a.callType ?? '￿').localeCompare(b.callType ?? '￿'),
        );
    }

    /** Полный пакет по звонку для глубокого анализа. */
    async getPackage(
        transcriptionId: string,
        allowedDomains: string[] | null = null,
    ): Promise<AgentCallPackageDto> {
        const row =
            await this.transcriptionStore.findPipelineById(transcriptionId);
        if (!row.dedupKey) {
            throw new NotFoundException(
                `Транскрипция ${transcriptionId} не из автоконвейера call-report`,
            );
        }
        // Изоляция порталов: чужой звонок для этого ключа не существует.
        if (
            allowedDomains &&
            (!row.domain || !allowedDomains.includes(row.domain.toLowerCase()))
        ) {
            throw new NotFoundException(
                `Транскрипция ${transcriptionId} не найдена`,
            );
        }

        const aiRecords = await this.aiService.findByTranscriptionIds([row.id]);
        const hasAgentAnalysis = aiRecords.some(
            record => record.type === AGENT_ANALYSIS_TYPE,
        );
        const classifyRecord = aiRecords.find(
            record => record.type === CALL_CLASSIFY_TYPE && record.result,
        );
        const callType = classifyRecord?.result;

        const bitrixData = await this.loadBitrixContext(row).catch(error => {
            this.logger.warn(
                `Bitrix-контекст не собран (${row.domain}): ${(error as Error).message}`,
            );
            return this.emptyBitrixContext();
        });

        return {
            call: this.toPendingDto(
                row,
                hasAgentAnalysis,
                callType ?? undefined,
            ),
            transcript: row.text ?? '',
            aiResults: aiRecords.map(record => this.toAiResultDto(record)),
            classification: this.toClassification(classifyRecord),
            typeProfile: callType
                ? (this.buildTypeProfiles()[callType] ?? null)
                : null,
            typeProfiles: this.buildTypeProfiles(),
            ...bitrixData,
        };
    }

    /** Полный результат классификатора из ais.user_result (если валиден). */
    private toClassification(
        record: AiEntityDto | undefined,
    ): Record<string, unknown> | null {
        if (!record) return null;
        const raw: unknown = record.user_result;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            return raw as Record<string, unknown>;
        }
        return record.result ? { callType: record.result } : null;
    }

    /**
     * Профили типов звонков для агента — прямой маппинг единого источника
     * правды CALL_REPORT_TYPE_PROFILES (конфиг смарта).
     */
    private buildTypeProfiles(): Record<string, AgentCallTypeProfileDto> {
        const profiles: Record<string, AgentCallTypeProfileDto> = {};
        for (const code of Object.keys(
            CALL_REPORT_TYPE_PROFILES,
        ) as CallReportCallTypeCode[]) {
            const profile = CALL_REPORT_TYPE_PROFILES[code];
            profiles[code] = {
                focus: profile.focus,
                sectionRelevance: { ...profile.sectionRelevance },
                talkRatioNorm: profile.talkRatioNorm,
                questionsNorm: profile.questionsNorm,
                knowledgeKind: profile.knowledgeKind,
            };
        }
        return profiles;
    }

    private emptyBitrixContext(): AgentBitrixContext {
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

    private async loadBitrixContext(
        row: TranscriptionPipelineView,
    ): Promise<AgentBitrixContext> {
        if (!row.domain || !row.entityId) {
            return this.emptyBitrixContext();
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
     * sales_kpi) в окне ±HISTORY_WINDOW_DAYS вокруг звонка. Семантическую
     * привязку «какая запись относится к звонку» делает сам агент.
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
     * Активные сделки компании по воронкам ОП (sales_base / sales_presentation
     * / sales_xo) — кандидаты для связей DEAL_MAIN/DEAL_PRESENTATION/DEAL_XO.
     * Паттерн повторяет event-report-init: фильтр по COMPANY_ID, CLOSED
     * отсеивается на клиенте, категория матчится по PortalModel.
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
     * Словарь pbx-полей компании портала: код → UF-имя + элементы enum.
     * Агент использует его, чтобы расшифровать сырые UF_CRM_* значения
     * компании (статусы op_prospects / op_work_status и т.п.).
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

    private toPendingDto(
        row: TranscriptionPipelineView,
        hasAgentAnalysis: boolean,
        callType?: string,
    ): AgentPendingCallDto {
        return {
            transcriptionId: row.id,
            domain: row.domain ?? '',
            activityId: row.activityId ?? '',
            callId: row.callId ?? undefined,
            callStartedAt: row.callStartedAt?.toISOString(),
            durationSec: row.durationSec ? Number(row.durationSec) : undefined,
            dealId: row.entityId ?? '',
            provider: row.provider ?? undefined,
            textLength: row.text?.length ?? 0,
            hasAgentAnalysis,
            callType,
        };
    }

    private toAiResultDto(record: AiEntityDto): AgentAiResultDto {
        return {
            id: String(record.id),
            type: record.type ?? '',
            provider: record.provider ?? '',
            result: record.result ?? '',
        };
    }
}
