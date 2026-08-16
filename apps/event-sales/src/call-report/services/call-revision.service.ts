import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AiService,
    CALL_RESUME_TYPE,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AGENT_ANALYSIS_TYPE } from '../../agent-gate/services/agent-call-package.service';
import {
    buildRevisionUserContent,
    CALL_REVISION_PROMPT,
    CALL_REVISION_SCHEMA,
    RevisionCallDigest,
} from '../contracts/call-revision.contract';
import {
    CallContextBuilderService,
    CallPassport,
} from './call-context-builder.service';

/** Итог ревизии одного домена. */
export interface CallRevisionDomainResult {
    domain: string;
    entitiesTotal: number;
    entitiesRevised: number;
    entitiesFailed: number;
}

/** Ответ модели-ревизора (соответствует CALL_REVISION_SCHEMA). */
interface RevisionVerdict {
    entitySummary: string;
    unkeptPromises: string[];
    dealRecommendations: string[];
    riskFlags: string[];
    coachingPriority: string | null;
}

/**
 * НОЧНОЙ РЕВИЗОР (Фаза 3, второй такт двухтактной модели): проход по
 * СУЩНОСТЯМ (сделкам/лидам), у которых за окно были разборы звонков.
 * Для каждой сущности: паспорт + свежие разборы + история → LLM-ревизия →
 * редактирование ПОСЛЕДНЕГО смарт-элемента (writer-upsert по xmlId:
 * рекомендации по сделке, риски, coaching) + итоговый коммент в таймлайн
 * сделки/лида.
 *
 * Fail-open на каждом уровне: сущность, у которой ревизия не удалась,
 * пропускается и попадёт в следующий прогон.
 */
@Injectable()
export class CallRevisionService {
    private readonly logger = new Logger(CallRevisionService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly contextBuilder: CallContextBuilderService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
    ) {}

    /** Ревизия домена за окно [from, to]; maxEntities — бюджет прохода. */
    async runForDomain(
        domain: string,
        from: Date,
        to: Date,
        maxEntities = 20,
    ): Promise<CallRevisionDomainResult> {
        const rows = await this.transcriptionStore.findDoneInPeriod(
            domain,
            from,
            to,
        );
        const byEntity = this.groupByEntity(rows);
        const entities = [...byEntity.entries()].slice(0, maxEntities);
        const result: CallRevisionDomainResult = {
            domain,
            entitiesTotal: byEntity.size,
            entitiesRevised: 0,
            entitiesFailed: 0,
        };
        if (byEntity.size > maxEntities) {
            this.logger.warn(
                `Ревизия ${domain}: сущностей ${byEntity.size}, лимит ${maxEntities} — хвост уйдёт в следующий прогон`,
            );
        }

        for (const [key, entityRows] of entities) {
            try {
                await this.reviseEntity(domain, entityRows);
                result.entitiesRevised++;
            } catch (error) {
                result.entitiesFailed++;
                this.logger.warn(
                    `Ревизия сущности ${key} (${domain}) не удалась: ${(error as Error).message}`,
                );
            }
        }
        this.logger.log(
            `Ревизия ${domain}: сущностей ${result.entitiesTotal}, ` +
                `обработано ${result.entitiesRevised}, ошибок ${result.entitiesFailed}`,
        );
        return result;
    }

    /** Строки за окно → группы по (entityType, entityId); без привязки — мимо. */
    private groupByEntity(
        rows: TranscriptionPipelineView[],
    ): Map<string, TranscriptionPipelineView[]> {
        const map = new Map<string, TranscriptionPipelineView[]>();
        for (const row of rows) {
            if (!row.entityType || !row.entityId) continue;
            const key = `${row.entityType}:${row.entityId}`;
            map.set(key, [...(map.get(key) ?? []), row]);
        }
        return map;
    }

    private async reviseEntity(
        domain: string,
        entityRows: TranscriptionPipelineView[],
    ): Promise<void> {
        // Свежие — по времени звонка, новые последними: последний звонок
        // становится носителем результатов ревизии.
        const fresh = [...entityRows].sort(
            (a, b) =>
                new Date(a.callStartedAt ?? 0).getTime() -
                new Date(b.callStartedAt ?? 0).getTime(),
        );
        const last = fresh[fresh.length - 1];

        const passport = await this.contextBuilder.build(last);
        const freshDigests = await this.buildDigests(fresh);
        const historyDigests: RevisionCallDigest[] = passport.history.map(
            item => ({
                startedAt: item.startedAt,
                summary: item.resume,
                nextStep: null,
                score: null,
            }),
        );

        const apiKey = await this.vibeKeyResolver.resolve(domain);
        const verdict = (await this.vibeCodeClient.structuredCompletion(
            CALL_REVISION_PROMPT,
            buildRevisionUserContent(
                this.contextBuilder.renderForPrompt(passport),
                freshDigests,
                historyDigests,
            ),
            'call_revision',
            CALL_REVISION_SCHEMA,
            apiKey,
        )) as RevisionVerdict;

        await this.applyVerdict(domain, last, verdict, passport);
    }

    /** Выжимки свежих разборов: agent-analysis (полный dto) или gigachat-резюме. */
    private async buildDigests(
        rows: TranscriptionPipelineView[],
    ): Promise<RevisionCallDigest[]> {
        const records = await this.aiService.findByTranscriptionIds(
            rows.map(row => row.id),
        );
        return rows.map(row => {
            const forRow = records.filter(
                record => String(record.transcription_id) === row.id,
            );
            const analysis = forRow.find(
                record => record.type === AGENT_ANALYSIS_TYPE,
            );
            const dto = (analysis?.user_result ?? null) as {
                summary?: string;
                score?: number;
                nextStep?: { description?: string };
            } | null;
            const resume = forRow.find(
                record => record.type === CALL_RESUME_TYPE,
            )?.result;
            return {
                startedAt: row.callStartedAt
                    ? new Date(row.callStartedAt).toISOString()
                    : null,
                summary: dto?.summary ?? resume ?? null,
                nextStep: dto?.nextStep?.description ?? null,
                score: dto?.score ?? null,
            };
        });
    }

    /**
     * Применение вердикта: upsert последнего смарт-элемента (рекомендации
     * по сделке, риски, coaching + ДОЛИВ CRM-связей из паспорта — чинит
     * элементы, где intake связи не заполнил) + итоговый коммент в
     * таймлайн сущности.
     */
    private async applyVerdict(
        domain: string,
        last: TranscriptionPipelineView,
        verdict: RevisionVerdict,
        passport: CallPassport,
    ): Promise<void> {
        const { bitrix } = await this.pbxService.init(domain);

        const smartInfo = await this.smartResolver.resolve(domain);
        if (smartInfo && last.activityId) {
            const writer = new CallReportSmartWriterService(bitrix, smartInfo);
            await writer.addItem({
                activityId: last.activityId,
                // Связи владельца звонка из CRM (источник истины) — upsert
                // дополняет существующий элемент, пустые значения не шлются.
                mainDealId:
                    passport.entityType === 'deal'
                        ? (passport.entityId ?? undefined)
                        : undefined,
                companyId: passport.crmCompanyId ?? undefined,
                contactId: passport.crmContactId ?? undefined,
                recommendations: [
                    ...verdict.dealRecommendations,
                    ...verdict.unkeptPromises.map(
                        promise => `Невыполненное обещание: ${promise}`,
                    ),
                ].join('\n'),
                riskFlags: verdict.riskFlags.length
                    ? verdict.riskFlags
                    : undefined,
                coachingPriority: verdict.coachingPriority ?? undefined,
            });
        }

        if (last.entityId && last.entityType) {
            const promises = verdict.unkeptPromises.length
                ? `\n\n[b]Невыполненные обещания:[/b]\n${verdict.unkeptPromises
                      .map(promise => `• ${promise}`)
                      .join('\n')}`
                : '';
            const recommendations = verdict.dealRecommendations.length
                ? `\n\n[b]Что дальше по сделке:[/b]\n${verdict.dealRecommendations
                      .map(item => `• ${item}`)
                      .join('\n')}`
                : '';
            await bitrix.timeline.addTimelineComment({
                ENTITY_ID: Number(last.entityId),
                ENTITY_TYPE: last.entityType,
                COMMENT:
                    `📋 [b]Ночная ревизия по клиенту[/b]\n\n` +
                    `${verdict.entitySummary}${promises}${recommendations}`,
                AUTHOR_ID: '1',
            });
        }
    }
}
