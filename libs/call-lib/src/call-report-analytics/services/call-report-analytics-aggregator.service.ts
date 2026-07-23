import { Injectable, Logger } from '@nestjs/common';
import {
    CALL_REPORT_SECTIONS,
    CALL_REPORT_TYPE_PROFILES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AnalyticsCallRow } from './call-report-analytics-data.service';
import {
    CallReportManagerStatDto,
    CallReportSectionStatDto,
} from '../dto/call-report-analytics-response.dto';

/** Ключ для строк без значения (менеджер/тип не определены). */
export const ANALYTICS_UNKNOWN_KEY = 'unknown';

/** Тело сводного отчёта (без meta — её собирает фасад). */
export interface SummaryReportBody {
    byCallType: Record<string, number>;
    productivity: Record<string, number>;
    avgScore: number | null;
    avgWeightedScore: number | null;
    nextStepSetRatePct: number | null;
    avgDurationSec: number | null;
    byManager: Record<string, number>;
}

/** Тело отчёта речевой аналитики. */
export interface SpeechReportBody {
    avgTalkRatioPct: number | null;
    talkRatioOutOfNorm: number;
    avgQuestionsCount: number | null;
    avgScriptCompliance: number | null;
    sections: CallReportSectionStatDto[];
}

/** Тело отчёта по возражениям/конкурентам/рискам. */
export interface ObjectionsReportBody {
    objectionCategories: Record<string, number>;
    handledRatePct: number | null;
    competitors: Record<string, number>;
    riskFlags: Record<string, number>;
    refusalCategories: Record<string, number>;
}

/** Тело отчёта по менеджерам. */
export interface ManagersReportBody {
    managers: CallReportManagerStatDto[];
}

/**
 * Агрегаторы отчётов — принцип «code computes numbers, LLM only explains»:
 * все числа считаются детерминированно из накопленных строк, LLM здесь
 * не участвует. Чистые функции без I/O — легко покрываются тестами.
 */
@Injectable()
export class CallReportAnalyticsAggregatorService {
    private readonly logger = new Logger(
        CallReportAnalyticsAggregatorService.name,
    );

    buildSummary(rows: AnalyticsCallRow[]): SummaryReportBody {
        const byCallType: Record<string, number> = {};
        const byManager: Record<string, number> = {};
        const productivity: Record<string, number> = {
            productive: 0,
            nonProductive: 0,
            unknown: 0,
        };
        const scores: number[] = [];
        const weightedScores: number[] = [];
        const durations: number[] = [];
        let nextStepKnown = 0;
        let nextStepSet = 0;

        for (const row of rows) {
            this.increment(byCallType, row.callType ?? ANALYTICS_UNKNOWN_KEY);
            this.increment(byManager, row.managerId ?? ANALYTICS_UNKNOWN_KEY);
            if (row.durationSec !== null) durations.push(row.durationSec);

            const productive = this.asBoolean(row.analysis?.productive);
            if (productive === true) productivity.productive++;
            else if (productive === false) productivity.nonProductive++;
            else productivity.unknown++;

            const score = this.asNumber(row.analysis?.score);
            if (score !== null) scores.push(score);
            const weighted = this.asNumber(row.analysis?.weightedScore);
            if (weighted !== null) weightedScores.push(weighted);

            const nextStep = row.analysis?.nextStep as
                | { set?: unknown }
                | undefined;
            const set = this.asBoolean(nextStep?.set);
            if (set !== null) {
                nextStepKnown++;
                if (set) nextStepSet++;
            }
        }

        const body: SummaryReportBody = {
            byCallType,
            productivity,
            avgScore: this.avg(scores, 1),
            avgWeightedScore: this.avg(weightedScores, 0),
            nextStepSetRatePct: nextStepKnown
                ? Math.round((nextStepSet / nextStepKnown) * 100)
                : null,
            avgDurationSec: this.avg(durations, 0),
            byManager,
        };
        this.logger.log(
            `summary: звонков ${rows.length}, типов ${Object.keys(byCallType).length}, ` +
                `avgWeightedScore=${body.avgWeightedScore ?? '—'}`,
        );
        return body;
    }

    buildSpeech(rows: AnalyticsCallRow[]): SpeechReportBody {
        const talkRatios: number[] = [];
        const questions: number[] = [];
        const compliance: number[] = [];
        let talkRatioOutOfNorm = 0;
        const sectionAcc = new Map<
            string,
            { scoreSum: number; scoreCount: number; relSum: number }
        >();

        for (const row of rows) {
            const talkRatio = this.asNumber(row.analysis?.talkRatioPct);
            if (talkRatio !== null) {
                talkRatios.push(talkRatio);
                // Норма зависит от ТИПА звонка (профили типов) — в этом и
                // есть взаимосвязь «тип ↔ анализ» на уровне отчёта.
                const norm = row.callType
                    ? CALL_REPORT_TYPE_PROFILES[
                          row.callType as CallReportCallTypeCode
                      ]?.talkRatioNorm
                    : null;
                if (norm && (talkRatio < norm.min || talkRatio > norm.max)) {
                    talkRatioOutOfNorm++;
                }
            }
            const questionsCount = this.asNumber(row.analysis?.questionsCount);
            if (questionsCount !== null) questions.push(questionsCount);
            const scriptCompliance = this.asNumber(
                row.analysis?.scriptCompliance,
            );
            if (scriptCompliance !== null) compliance.push(scriptCompliance);

            const sections = Array.isArray(row.analysis?.sections)
                ? (row.analysis?.sections as Record<string, unknown>[])
                : [];
            for (const section of sections) {
                const code = this.asStringValue(section.section);
                const relevance = this.asNumber(section.relevance);
                if (!code || relevance === null || relevance <= 0) continue;
                const acc = sectionAcc.get(code) ?? {
                    scoreSum: 0,
                    scoreCount: 0,
                    relSum: 0,
                };
                acc.relSum += relevance;
                const score = this.asNumber(section.score);
                if (score !== null) {
                    acc.scoreSum += score;
                    acc.scoreCount++;
                }
                sectionAcc.set(code, acc);
            }
        }

        // Порядок разделов — канонический из конфига смарта.
        const sections: CallReportSectionStatDto[] = [];
        for (const { code } of CALL_REPORT_SECTIONS) {
            const acc = sectionAcc.get(code);
            if (!acc) continue;
            const relCount = Math.max(acc.scoreCount, 1);
            sections.push({
                section: code,
                avgScore: acc.scoreCount
                    ? this.round(acc.scoreSum / acc.scoreCount, 1)
                    : 0,
                avgRelevance: Math.round(acc.relSum / relCount),
                count: acc.scoreCount,
            });
        }

        const body: SpeechReportBody = {
            avgTalkRatioPct: this.avg(talkRatios, 0),
            talkRatioOutOfNorm,
            avgQuestionsCount: this.avg(questions, 1),
            avgScriptCompliance: this.avg(compliance, 0),
            sections,
        };
        this.logger.log(
            `speech: разделов ${sections.length}, вне нормы talkRatio ${talkRatioOutOfNorm}`,
        );
        return body;
    }

    buildObjections(rows: AnalyticsCallRow[]): ObjectionsReportBody {
        const objectionCategories: Record<string, number> = {};
        const competitors: Record<string, number> = {};
        const riskFlags: Record<string, number> = {};
        const refusalCategories: Record<string, number> = {};
        let objectionsTotal = 0;
        let objectionsHandled = 0;

        for (const row of rows) {
            for (const category of this.asStringArray(
                row.analysis?.objectionCategories,
            )) {
                this.increment(objectionCategories, category);
            }
            for (const competitor of this.asStringArray(
                row.analysis?.competitors,
            )) {
                this.increment(competitors, competitor);
            }
            for (const flag of this.asStringArray(row.analysis?.riskFlags)) {
                this.increment(riskFlags, flag);
            }
            const refusal = this.asStringValue(row.analysis?.refusalCategory);
            if (refusal) this.increment(refusalCategories, refusal);

            const objections = Array.isArray(row.analysis?.objections)
                ? (row.analysis?.objections as Record<string, unknown>[])
                : [];
            for (const objection of objections) {
                const handled = this.asBoolean(objection.handled);
                if (handled === null) continue;
                objectionsTotal++;
                if (handled) objectionsHandled++;
                // Категории из objections[] — если явного массива не было.
                const category = this.asStringValue(objection.category);
                if (
                    category &&
                    !this.asStringArray(row.analysis?.objectionCategories)
                        .length
                ) {
                    this.increment(objectionCategories, category);
                }
            }
        }

        const body: ObjectionsReportBody = {
            objectionCategories,
            handledRatePct: objectionsTotal
                ? Math.round((objectionsHandled / objectionsTotal) * 100)
                : null,
            competitors,
            riskFlags,
            refusalCategories,
        };
        this.logger.log(
            `objections: возражений с исходом ${objectionsTotal}, ` +
                `отработано ${body.handledRatePct ?? '—'}%`,
        );
        return body;
    }

    buildManagers(rows: AnalyticsCallRow[]): ManagersReportBody {
        const acc = new Map<
            string,
            {
                calls: number;
                analyzed: number;
                weighted: number[];
                productiveKnown: number;
                productive: number;
                talkRatios: number[];
            }
        >();

        for (const row of rows) {
            const key = row.managerId ?? ANALYTICS_UNKNOWN_KEY;
            const stat = acc.get(key) ?? {
                calls: 0,
                analyzed: 0,
                weighted: [],
                productiveKnown: 0,
                productive: 0,
                talkRatios: [],
            };
            stat.calls++;
            if (row.analysis) {
                stat.analyzed++;
                const weighted = this.asNumber(row.analysis.weightedScore);
                if (weighted !== null) stat.weighted.push(weighted);
                const productive = this.asBoolean(row.analysis.productive);
                if (productive !== null) {
                    stat.productiveKnown++;
                    if (productive) stat.productive++;
                }
                const talkRatio = this.asNumber(row.analysis.talkRatioPct);
                if (talkRatio !== null) stat.talkRatios.push(talkRatio);
            }
            acc.set(key, stat);
        }

        const managers: CallReportManagerStatDto[] = [...acc.entries()]
            .map(([managerId, stat]) => ({
                managerId,
                calls: stat.calls,
                analyzed: stat.analyzed,
                avgWeightedScore: this.avg(stat.weighted, 0),
                productiveRatePct: stat.productiveKnown
                    ? Math.round((stat.productive / stat.productiveKnown) * 100)
                    : null,
                avgTalkRatioPct: this.avg(stat.talkRatios, 0),
            }))
            .sort(
                (a, b) =>
                    (b.avgWeightedScore ?? -1) - (a.avgWeightedScore ?? -1),
            );

        this.logger.log(`managers: менеджеров в рейтинге ${managers.length}`);
        return { managers };
    }

    private increment(map: Record<string, number>, key: string): void {
        map[key] = (map[key] ?? 0) + 1;
    }

    private avg(values: number[], digits: number): number | null {
        if (!values.length) return null;
        const sum = values.reduce((total, value) => total + value, 0);
        return this.round(sum / values.length, digits);
    }

    private round(value: number, digits: number): number {
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
    }

    private asNumber(value: unknown): number | null {
        return typeof value === 'number' && Number.isFinite(value)
            ? value
            : null;
    }

    private asBoolean(value: unknown): boolean | null {
        return typeof value === 'boolean' ? value : null;
    }

    private asStringValue(value: unknown): string | null {
        return typeof value === 'string' && value ? value : null;
    }

    private asStringArray(value: unknown): string[] {
        return Array.isArray(value)
            ? value.filter(
                  (item): item is string =>
                      typeof item === 'string' && item !== '',
              )
            : [];
    }
}
