import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/services/ai.service';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { TranscriptionPipelineView } from '../../transcription/types/transcription-pipeline.types';
import { AGENT_ANALYSIS_TYPE } from './call-report-weekly.types';
import {
    CallReportWeeklyRow,
    CallReportWeeklySectionRow,
    CallReportWeeklyDataset,
} from './call-report-weekly.types';

/** Разбор одного раздела в записи ais (совпадает с контрактом агента). */
interface RawSection {
    section?: string;
    relevance?: number;
    score?: number;
    analysis?: string;
    advice?: string;
}

/** Полный разбор из ais.user_result — источник ПОЛНЫХ текстов. */
interface RawAnalysis {
    callType?: string;
    summary?: string;
    score?: number;
    weightedScore?: number;
    scoreExplanation?: string;
    productive?: boolean;
    interlocutorRole?: string;
    specialist?: string;
    sentiment?: string;
    talkRatioPct?: number;
    questionsCount?: number;
    scriptCompliance?: number;
    coachingPriority?: string;
    needsFound?: boolean;
    needs?: string[];
    presentationDone?: boolean;
    productsOffered?: string[];
    objections?: { objection?: string; handling?: string }[];
    refusalCategory?: string;
    riskFlags?: string[];
    recommendations?: string[];
    employeeRecommendations?: string;
    speechAnalysis?: string;
    hvostDone?: boolean;
    hvostAnalysis?: string;
    fiveKDone?: boolean;
    fiveKAnalysis?: string;
    reportComparison?: string;
    nextStep?: { set?: boolean; description?: string; date?: string };
    sections?: RawSection[];
}

/**
 * Сбор данных недельного отчёта по звонкам одного портала.
 *
 * ЗАЧЕМ: карточка смарта физически не вмещает все тексты разбора — строка
 * таблицы Битрикса ограничена ~8126 байтами, поэтому длинные разборы в ней
 * ужимаются. Полные версии живут в БД (ais.user_result) и в таймлайне;
 * недельный Excel собирает их в одном месте — «всё, что не попало в смарт».
 */
@Injectable()
export class CallReportWeeklyDataService {
    private readonly logger = new Logger(CallReportWeeklyDataService.name);

    constructor(
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    /** Данные по всем разобранным звонкам портала за период. */
    async collect(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<CallReportWeeklyDataset> {
        const calls = await this.transcriptionStore.findDoneInPeriod(
            domain,
            from,
            to,
        );
        if (!calls.length) {
            return { domain, from, to, rows: [], sections: [] };
        }
        const analyses = await this.loadAnalyses(calls);

        const rows: CallReportWeeklyRow[] = [];
        const sections: CallReportWeeklySectionRow[] = [];
        for (const call of calls) {
            const analysis = analyses.get(call.id) ?? null;
            rows.push(this.buildRow(call, analysis));
            if (analysis?.sections?.length) {
                sections.push(...this.buildSectionRows(call, analysis));
            }
        }
        this.logger.log(
            `Недельный отчёт ${domain}: звонков ${rows.length}, ` +
                `строк по разделам ${sections.length}`,
        );
        return { domain, from, to, rows, sections };
    }

    /** ais-записи глубокого разбора по транскрипциям (пачкой). */
    private async loadAnalyses(
        calls: TranscriptionPipelineView[],
    ): Promise<Map<string, RawAnalysis>> {
        const byTranscription = new Map<string, RawAnalysis>();
        const records = await this.aiService.findByTranscriptionIds(
            calls.map(call => call.id),
        );
        for (const record of records) {
            if (record.type !== AGENT_ANALYSIS_TYPE) continue;
            const transcriptionId = record.transcription_id
                ? String(record.transcription_id)
                : null;
            if (!transcriptionId) continue;
            const raw: unknown = record.user_result;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                byTranscription.set(transcriptionId, raw as RawAnalysis);
            }
        }
        return byTranscription;
    }

    /** Одна строка листа «Звонки»: паспорт + ПОЛНЫЕ тексты разбора. */
    private buildRow(
        call: TranscriptionPipelineView,
        analysis: RawAnalysis | null,
    ): CallReportWeeklyRow {
        const objections = (analysis?.objections ?? [])
            .map(item =>
                item.handling
                    ? `${item.objection} → ${item.handling}`
                    : (item.objection ?? ''),
            )
            .filter(Boolean);
        return {
            callDate: call.callStartedAt ?? call.createdAt,
            managerId: call.userId ? Number(call.userId) : null,
            durationMin: call.durationSec
                ? Math.max(1, Math.round(Number(call.durationSec) / 60))
                : null,
            entityType: call.entityType,
            entityId: call.entityId ? Number(call.entityId) : null,
            activityId: call.activityId,
            analyzed: analysis !== null,
            callType: analysis?.callType ?? null,
            productive: analysis?.productive ?? null,
            score: analysis?.score ?? null,
            weightedScore: analysis?.weightedScore ?? null,
            scriptCompliance: analysis?.scriptCompliance ?? null,
            coachingPriority: analysis?.coachingPriority ?? null,
            interlocutorRole: analysis?.interlocutorRole ?? null,
            specialist: analysis?.specialist ?? null,
            sentiment: analysis?.sentiment ?? null,
            talkRatioPct: analysis?.talkRatioPct ?? null,
            questionsCount: analysis?.questionsCount ?? null,
            nextStepSet: analysis?.nextStep?.set ?? null,
            nextStep: analysis?.nextStep?.description ?? null,
            nextStepDate: analysis?.nextStep?.date ?? null,
            hvostDone: analysis?.hvostDone ?? null,
            fiveKDone: analysis?.fiveKDone ?? null,
            summary: analysis?.summary ?? null,
            scoreExplanation: analysis?.scoreExplanation ?? null,
            needs: (analysis?.needs ?? []).join('\n') || null,
            productsOffered:
                (analysis?.productsOffered ?? []).join('\n') || null,
            objections: objections.join('\n') || null,
            refusalCategory: analysis?.refusalCategory ?? null,
            riskFlags: (analysis?.riskFlags ?? []).join('\n') || null,
            recommendations:
                (analysis?.recommendations ?? []).join('\n') || null,
            employeeRecommendations: analysis?.employeeRecommendations ?? null,
            speechAnalysis: analysis?.speechAnalysis ?? null,
            hvostAnalysis: analysis?.hvostAnalysis ?? null,
            fiveKAnalysis: analysis?.fiveKAnalysis ?? null,
            reportComparison: analysis?.reportComparison ?? null,
            transcript: call.text ?? null,
        };
    }

    /** Строки листа «Разделы»: по одной на каждый этап разговора. */
    private buildSectionRows(
        call: TranscriptionPipelineView,
        analysis: RawAnalysis,
    ): CallReportWeeklySectionRow[] {
        return (analysis.sections ?? [])
            .filter(section => Boolean(section.section))
            .map(section => ({
                callDate: call.callStartedAt ?? call.createdAt,
                managerId: call.userId ? Number(call.userId) : null,
                activityId: call.activityId,
                callType: analysis.callType ?? null,
                section: section.section ?? '',
                relevance: section.relevance ?? null,
                score: section.score ?? null,
                analysis: section.analysis ?? null,
                advice: section.advice ?? null,
            }));
    }
}
