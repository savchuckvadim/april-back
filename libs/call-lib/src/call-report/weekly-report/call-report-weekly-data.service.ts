import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/services/ai.service';
import { TranscriptionStoreService } from '../../transcription/services/transcription.store.service';
import { TranscriptionPipelineView } from '../../transcription/types/transcription-pipeline.types';
import { AGENT_ANALYSIS_TYPE } from './call-report-weekly.types';
import {
    CallReportWeeklyRow,
    CallReportWeeklySectionRow,
    CallReportWeeklyDataset,
    CallReportWeeklyTranscriptRow,
    CallReportWeeklyPresentationRow,
    WeeklyHvostSteps,
    WeeklyFiveKItems,
} from './call-report-weekly.types';
import { CallReportSmartResolverService } from '../services/call-report-smart-resolver.service';

/** Размер фрагмента расшифровки: под лимит ячейки Excel (32767). */
const TRANSCRIPT_PART_CHARS = 30000;

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
    /** Гранулярные чеклисты (зеркало полей менеджера). */
    hvostSteps?: WeeklyHvostSteps;
    fiveKItems?: WeeklyFiveKItems;
    /** Связи, уточнённые разбором (для кликабельных ссылок). */
    relatedDeals?: {
        companyId?: number;
        contactId?: number;
        mainDealId?: number;
        presentationDealId?: number;
    };
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
        private readonly smartResolver: CallReportSmartResolverService,
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
        const smartEntityTypeId = await this.resolveSmartEntityTypeId(domain);
        if (!calls.length) {
            return {
                domain,
                from,
                to,
                smartEntityTypeId,
                rows: [],
                sections: [],
                transcripts: [],
                presentations: [],
            };
        }
        const analyses = await this.loadAnalyses(calls);

        const rows: CallReportWeeklyRow[] = [];
        const sections: CallReportWeeklySectionRow[] = [];
        const transcripts: CallReportWeeklyTranscriptRow[] = [];
        const presentations: CallReportWeeklyPresentationRow[] = [];
        for (const call of calls) {
            const record = analyses.get(call.id) ?? null;
            const analysis = record?.analysis ?? null;
            const row = this.buildRow(
                call,
                analysis,
                record?.smartItemId ?? null,
            );
            rows.push(row);
            if (analysis?.sections?.length) {
                sections.push(...this.buildSectionRows(call, analysis));
            }
            transcripts.push(...this.buildTranscriptRows(row, call.text));
            // Тип звонка модель иногда ставит «другое», хотя хвост/5К
            // разобраны — поэтому на лист презентаций берём по НАЛИЧИЮ
            // разбора, а не по типу (жалоба владельца 27.08.2026).
            const presentation = this.buildPresentationRow(row);
            if (presentation) presentations.push(presentation);
        }
        this.logger.log(
            `Недельный отчёт ${domain}: звонков ${rows.length}, ` +
                `разделов ${sections.length}, фрагментов расшифровок ` +
                `${transcripts.length}, презентаций ${presentations.length}`,
        );
        return {
            domain,
            from,
            to,
            smartEntityTypeId,
            rows,
            sections,
            transcripts,
            presentations,
        };
    }

    /** entityTypeId смарта — основа ссылок на карточки разборов. */
    private async resolveSmartEntityTypeId(
        domain: string,
    ): Promise<number | null> {
        try {
            const info = await this.smartResolver.resolve(domain);
            return info?.entityTypeId ?? null;
        } catch (error) {
            this.logger.warn(
                `Смарт «AI-анализ звонков» не разрешён (${domain}): ` +
                    (error as Error).message,
            );
            return null;
        }
    }

    /**
     * Расшифровка целиком: длинный текст (трёхчасовой разговор — сотни
     * тысяч символов) режется на части под лимит ячейки Excel, каждая
     * часть — отдельная строка листа «Транскрипции».
     */
    private buildTranscriptRows(
        row: CallReportWeeklyRow,
        text: string | null,
    ): CallReportWeeklyTranscriptRow[] {
        const full = text?.trim();
        if (!full) return [];
        const parts: string[] = [];
        for (let i = 0; i < full.length; i += TRANSCRIPT_PART_CHARS) {
            parts.push(full.slice(i, i + TRANSCRIPT_PART_CHARS));
        }
        return parts.map((part, index) => ({
            callDate: row.callDate,
            managerId: row.managerId,
            activityId: row.activityId,
            smartItemId: row.smartItemId,
            entityType: row.entityType,
            entityId: row.entityId,
            callType: row.callType,
            durationMin: row.durationMin,
            part: index + 1,
            partsTotal: parts.length,
            text: part,
        }));
    }

    /**
     * Лист «Презентации»: звонок попадает сюда, если по нему ЕСТЬ разбор
     * хвоста или 5К — в любом виде (итог, текст разбора или хотя бы один
     * пункт чеклиста). Тип звонка не проверяется: классификатор иногда
     * ставит «другое», а методологический разбор при этом выполнен.
     */
    private buildPresentationRow(
        row: CallReportWeeklyRow,
    ): CallReportWeeklyPresentationRow | null {
        const hasChecklist = (
            items: WeeklyHvostSteps | WeeklyFiveKItems | null,
        ): boolean =>
            items !== null &&
            Object.values(items).some(value => typeof value === 'boolean');
        const relevant =
            row.hvostDone !== null ||
            row.fiveKDone !== null ||
            Boolean(row.hvostAnalysis) ||
            Boolean(row.fiveKAnalysis) ||
            hasChecklist(row.hvostSteps) ||
            hasChecklist(row.fiveKItems);
        if (!relevant) return null;
        return {
            callDate: row.callDate,
            managerId: row.managerId,
            activityId: row.activityId,
            smartItemId: row.smartItemId,
            entityType: row.entityType,
            entityId: row.entityId,
            callType: row.callType,
            durationMin: row.durationMin,
            hvostDone: row.hvostDone,
            fiveKDone: row.fiveKDone,
            hvostSteps: row.hvostSteps,
            fiveKItems: row.fiveKItems,
            hvostAnalysis: row.hvostAnalysis,
            fiveKAnalysis: row.fiveKAnalysis,
            reportComparison: row.reportComparison,
            nextStepSet: row.nextStepSet,
            nextStep: row.nextStep,
            nextStepDate: row.nextStepDate,
            score: row.score,
        };
    }

    /** ais-записи глубокого разбора по транскрипциям (пачкой). */
    private async loadAnalyses(
        calls: TranscriptionPipelineView[],
    ): Promise<
        Map<string, { analysis: RawAnalysis; smartItemId: number | null }>
    > {
        const byTranscription = new Map<
            string,
            { analysis: RawAnalysis; smartItemId: number | null }
        >();
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
                // report_item_id — элемент смарта, созданный по этому
                // разбору: даёт кликабельную ссылку на карточку.
                const itemId = Number(record.report_item_id);
                byTranscription.set(transcriptionId, {
                    analysis: raw as RawAnalysis,
                    smartItemId:
                        Number.isFinite(itemId) && itemId > 0 ? itemId : null,
                });
            }
        }
        return byTranscription;
    }

    /** Одна строка листа «Звонки»: паспорт + ПОЛНЫЕ тексты разбора. */
    private buildRow(
        call: TranscriptionPipelineView,
        analysis: RawAnalysis | null,
        smartItemId: number | null,
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
            durationSec: call.durationSec ? Number(call.durationSec) : null,
            entityType: call.entityType,
            entityId: call.entityId ? Number(call.entityId) : null,
            activityId: call.activityId,
            smartItemId,
            companyId: analysis?.relatedDeals?.companyId ?? null,
            contactId: analysis?.relatedDeals?.contactId ?? null,
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
            hvostSteps: analysis?.hvostSteps ?? null,
            fiveKItems: analysis?.fiveKItems ?? null,
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
