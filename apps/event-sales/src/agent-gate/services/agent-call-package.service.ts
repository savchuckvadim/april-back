import {
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    AGENT_ANALYSIS_TYPE,
    AiEntityDto,
    AiService,
    CALL_CLASSIFY_TYPE,
    CallTypeRegistry,
    CallTypeRegistryService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import {
    AgentAiResultDto,
    AgentCallPackageDto,
    AgentCallTypeProfileDto,
    AgentPendingCallDto,
} from '../dto/agent-response.dto';
import { AgentBitrixContextService } from './agent-bitrix-context.service';

// Ре-экспорты для существующих импортов agent-gate: константы теперь в
// @lib/call-lib (ai-record-types.const), типы контекста — в
// agent-bitrix-context.service.
export { AGENT_ANALYSIS_TYPE, CALL_CLASSIFY_TYPE };
export type { AgentDealCandidates } from './agent-bitrix-context.service';

/**
 * Сборка данных для внешнего агента-аналитика:
 * список ожидающих звонков и полный пакет по звонку (транскрипт,
 * первичные AI-анализы, профили типов, Bitrix-контекст — его собирает
 * AgentBitrixContextService).
 */
@Injectable()
export class AgentCallPackageService {
    private readonly logger = new Logger(AgentCallPackageService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly bitrixContext: AgentBitrixContextService,
        private readonly callTypeRegistry: CallTypeRegistryService,
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

        const bitrixData = await this.bitrixContext.load(row).catch(error => {
            this.logger.warn(
                `Bitrix-контекст не собран (${row.domain}): ${(error as Error).message}`,
            );
            return this.bitrixContext.empty();
        });

        // Профили типов — из реестра (встроенные + общие/клиентские из
        // базы знаний); недоступность реестра не роняет пакет.
        const registry = await this.callTypeRegistry
            .resolve(row.domain ?? '')
            .catch((error: Error) => {
                this.logger.warn(
                    `Реестр типов не получен (${row.domain}): ${error.message}`,
                );
                return this.callTypeRegistry.builtin();
            });
        const typeProfiles = this.buildTypeProfiles(registry);

        return {
            call: this.toPendingDto(
                row,
                hasAgentAnalysis,
                callType ?? undefined,
            ),
            transcript: row.text ?? '',
            aiResults: aiRecords.map(record => this.toAiResultDto(record)),
            classification: this.toClassification(classifyRecord),
            typeProfile: callType ? (typeProfiles[callType] ?? null) : null,
            typeProfiles,
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
     * Профили типов звонков для агента — из реестра типов (встроенные +
     * переопределения/дополнения из базы знаний, включая клиентские).
     */
    private buildTypeProfiles(
        registry: CallTypeRegistry,
    ): Record<string, AgentCallTypeProfileDto> {
        const profiles: Record<string, AgentCallTypeProfileDto> = {};
        for (const code of registry.codes) {
            const profile = registry.types[code];
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
