import { Injectable, Logger } from '@nestjs/common';
import { KNOWN_KNOWLEDGE_KINDS, KnowledgeContentService } from '@lib/ai-rag';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { MethodologyRegistryService } from '../methodology/methodology-registry.service';
import type { ResolvedMethodology } from '../methodology/methodology.types';
import { CallTypeRegistryService } from '../services/call-type-registry.service';
import { joinKnowledgeTexts } from '../services/knowledge-materials.service';
import {
    KNOWLEDGE_CHARS_PER_TOKEN,
    budgetKindsOf,
    buildKnowledgeBudgetReport,
    type KnowledgeBudgetCallType,
    type KnowledgeBudgetKindReport,
    type KnowledgeKindMeasure,
} from './knowledge-budget-report.util';

/** Методика портала в объёме сводки. */
export interface KnowledgeBudgetMethodology {
    title: string;
    version: string;
    /** Методика объявила свои виды материалов. */
    declaresKnowledge: boolean;
}

export interface KnowledgeBudgetReport {
    domain: string;
    charsPerToken: number;
    /** null — методика на портале не выбрана. */
    methodology: KnowledgeBudgetMethodology | null;
    /** Проверка по регламенту включена на портале; null — настройки не прочитаны. */
    complianceEnabled: boolean | null;
    kinds: KnowledgeBudgetKindReport[];
}

/**
 * Сводка бюджетов базы знаний портала для админки. Только чтение: реестр
 * типов звонков, методика портала, документы базы знаний. К Битриксу и к
 * модели не обращается.
 */
@Injectable()
export class KnowledgeBudgetReportService {
    private readonly logger = new Logger(KnowledgeBudgetReportService.name);

    constructor(
        private readonly knowledgeContent: KnowledgeContentService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly methodologyRegistry: MethodologyRegistryService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    async report(domain: string): Promise<KnowledgeBudgetReport> {
        const resolved = await this.methodologyRegistry.resolve(domain);
        const knowledge = resolved?.methodology.knowledge;
        const types = await this.callTypes(domain, resolved);

        const measures: KnowledgeKindMeasure[] = [];
        for (const kind of budgetKindsOf(types, knowledge)) {
            measures.push(await this.measure(domain, kind));
        }
        return {
            domain,
            charsPerToken: KNOWLEDGE_CHARS_PER_TOKEN,
            methodology: resolved
                ? {
                      title: resolved.methodology.title,
                      version: resolved.methodology.version,
                      declaresKnowledge:
                          Object.keys(knowledge ?? {}).length > 0,
                  }
                : null,
            complianceEnabled: await this.complianceEnabled(domain),
            kinds: buildKnowledgeBudgetReport({
                types,
                knowledge,
                measures,
                titleOf: kind =>
                    KNOWN_KNOWLEDGE_KINDS.find(info => info.kind === kind)
                        ?.title ?? kind,
            }),
        };
    }

    /** Типы звонков портала с видом инструкции — как их видит разбор. */
    private async callTypes(
        domain: string,
        resolved: ResolvedMethodology | null,
    ): Promise<KnowledgeBudgetCallType[]> {
        const registry = await this.callTypeRegistry.resolve(domain);
        const methodologyTypes: readonly string[] =
            resolved?.methodology.types ?? [];
        return registry.codes.map(code => {
            const profile = registry.types[code];
            return {
                code,
                title: profile?.title ?? code,
                typedKind: profile?.knowledgeKind ?? `call-analysis-${code}`,
                methodology: methodologyTypes.includes(code),
            };
        });
    }

    /** Объём вида; вид не прочитался — считается пустым, как в разборе. */
    private async measure(
        domain: string,
        kind: string,
    ): Promise<KnowledgeKindMeasure> {
        try {
            const joined = joinKnowledgeTexts(
                await this.knowledgeContent.readAll(domain, kind),
                kind,
            );
            return {
                kind,
                documents: joined.documents,
                chars: joined.text.length,
            };
        } catch (error) {
            this.logger.warn(
                `Материалы вида ${kind} недоступны (${domain}): ${(error as Error).message}`,
            );
            return { kind, documents: 0, chars: 0 };
        }
    }

    private async complianceEnabled(domain: string): Promise<boolean | null> {
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            return record?.complianceReviewEnabled ?? false;
        } catch (error) {
            this.logger.warn(
                `Настройки AI портала ${domain} не прочитаны: ${(error as Error).message}`,
            );
            return null;
        }
    }
}
