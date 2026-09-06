import { Injectable } from '@nestjs/common';
import {
    AGENT_ANALYSIS_TYPE,
    AiEntityDto,
    AiService,
    CALL_CLASSIFY_TYPE,
} from '@lib/call-lib';
import { CLASSIFY_ESCALATION_CONFIDENCE } from './call-classify-step.service';
import {
    CallTypeStatsResponseDto,
    CallTypeStatsSampleDto,
} from '../dto/call-report-response.dto';

/** Сколько примеров «другое» отдаём для ручной калибровки. */
const SAMPLE_LIMIT = 20;
const OTHER_CALL_TYPE = 'other';

/** Что классификатор записал по звонку (ais type=call-classify). */
interface ClassifyFacts {
    callType: string;
    confidence: number | null;
    reason: string | null;
    priorApplied: boolean;
    originalCallType: string | null;
}

/** Что глубокий разбор записал по звонку (ais type=agent-analysis). */
interface AnalysisFacts {
    callType: string | null;
    callTypeRefined: string | null;
}

/**
 * Статистика типов звонков по ais-записям портала за период — цифры для
 * калибровки классификатора (ai/tasks/call-type-accuracy-plan.md):
 * распределение «как сказал классификатор» и «как в итоге» (после приора
 * CRM и уточнения синтезом), доля «другое», средняя и низкая уверенность,
 * сколько раз сработали приор и синтез, примеры «другое» с причинами.
 */
@Injectable()
export class CallTypeStatsService {
    constructor(private readonly aiService: AiService) {}

    async collect(
        domain: string,
        from: Date,
        to: Date,
    ): Promise<CallTypeStatsResponseDto> {
        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [CALL_CLASSIFY_TYPE, AGENT_ANALYSIS_TYPE],
            from,
            to,
        );
        const classify = new Map<string, ClassifyFacts>();
        const analysis = new Map<string, AnalysisFacts>();
        for (const record of records) {
            const key = record.transcription_id ?? `ai:${record.id}`;
            if (record.type === CALL_CLASSIFY_TYPE) {
                classify.set(key, this.readClassify(record));
            } else {
                analysis.set(key, this.readAnalysis(record));
            }
        }

        const ids = new Set<string>([...classify.keys(), ...analysis.keys()]);
        const classifierByType: Record<string, number> = {};
        const finalByType: Record<string, number> = {};
        const samples: CallTypeStatsSampleDto[] = [];
        let confidenceSum = 0;
        let confidenceCount = 0;
        let lowConfidence = 0;
        let priorApplied = 0;
        let refinedBySynthesis = 0;

        for (const id of ids) {
            const cls = classify.get(id);
            const deep = analysis.get(id);
            if (cls) {
                classifierByType[cls.callType] =
                    (classifierByType[cls.callType] ?? 0) + 1;
                if (cls.confidence !== null) {
                    confidenceSum += cls.confidence;
                    confidenceCount += 1;
                    if (cls.confidence < CLASSIFY_ESCALATION_CONFIDENCE) {
                        lowConfidence += 1;
                    }
                }
                if (cls.priorApplied) priorApplied += 1;
            }
            const finalType =
                deep?.callType ?? cls?.callType ?? OTHER_CALL_TYPE;
            finalByType[finalType] = (finalByType[finalType] ?? 0) + 1;
            if (
                deep?.callTypeRefined &&
                cls &&
                deep.callTypeRefined !== cls.callType &&
                deep.callType === deep.callTypeRefined
            ) {
                refinedBySynthesis += 1;
            }
            if (
                finalType === OTHER_CALL_TYPE &&
                samples.length < SAMPLE_LIMIT
            ) {
                samples.push({
                    transcriptionId: id,
                    classifierType: cls?.callType ?? null,
                    confidence: cls?.confidence ?? null,
                    finalType,
                    reason: cls?.reason ?? null,
                });
            }
        }

        const total = ids.size;
        const otherCount = finalByType[OTHER_CALL_TYPE] ?? 0;
        return {
            domain,
            from: from.toISOString(),
            to: to.toISOString(),
            total,
            classifierByType,
            finalByType,
            otherSharePct: total ? Math.round((otherCount / total) * 100) : 0,
            avgConfidence: confidenceCount
                ? Math.round((confidenceSum / confidenceCount) * 100) / 100
                : null,
            lowConfidence,
            priorApplied,
            refinedBySynthesis,
            samples,
        };
    }

    private readClassify(record: AiEntityDto): ClassifyFacts {
        const raw = this.asObject(record.user_result);
        return {
            callType:
                record.result ?? this.asString(raw.callType) ?? OTHER_CALL_TYPE,
            confidence: this.asNumber(raw.confidence),
            reason: this.asString(raw.reason),
            priorApplied: raw.priorApplied === true,
            originalCallType: this.asString(raw.originalCallType),
        };
    }

    private readAnalysis(record: AiEntityDto): AnalysisFacts {
        const raw = this.asObject(record.user_result);
        return {
            callType: this.asString(raw.callType),
            callTypeRefined: this.asString(raw.callTypeRefined),
        };
    }

    private asObject(value: unknown): Record<string, unknown> {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {};
    }

    private asString(value: unknown): string | null {
        return typeof value === 'string' && value ? value : null;
    }

    private asNumber(value: unknown): number | null {
        return typeof value === 'number' && Number.isFinite(value)
            ? value
            : null;
    }
}
