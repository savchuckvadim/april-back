import {
    CALL_REPORT_SECTIONS,
    FIVE_K_TEXT_BLOCKS,
    HVOST_TEXT_BLOCKS,
    type ChecklistTextBlock,
} from '@lib/call-lib';
import {
    ANALYSIS_PREVIEW_POINT_KINDS,
    type AnalysisPreviewCoverage,
    type AnalysisPreviewPoint,
    type AnalysisPreviewResult,
    type AnalysisPreviewSectionScore,
} from '@lib/call-lib/call-report/analysis-preview';
import type {
    AgentCallAnalysisDto,
    AgentChecklistEvidenceDto,
} from '../../agent-gate/dto/agent-analysis-request.dto';
import { readLongCallMark } from '../long-call/long-call-mark.util';

/**
 * Итог проверки разбора на звонке (задание focus-v3.4): места разбора в
 * разговоре — разделы, потребности, пункты «хвоста» и 5К — и сравнение
 * оценок с действующим разбором. Чистые функции.
 */

/** Отказ проверки с причиной для человека (в состояние, не наружу). */
export class AnalysisPreviewError extends Error {}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberOrNull = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const textOrNull = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const sectionTitle = (code: string): string =>
    CALL_REPORT_SECTIONS.find(section => section.code === code)?.title ?? code;

function sectionPoints(dto: AgentCallAnalysisDto): AnalysisPreviewPoint[] {
    return (dto.sections ?? [])
        .filter(section => section.relevance > 0)
        .map(
            (section): AnalysisPreviewPoint => ({
                kind: 'section',
                title: sectionTitle(section.section),
                quote: textOrNull(section.quote),
                startSec: numberOrNull(section.startSec),
            }),
        );
}

function needPoints(dto: AgentCallAnalysisDto): AnalysisPreviewPoint[] {
    return (dto.needItems ?? []).map(
        (item): AnalysisPreviewPoint => ({
            kind: 'need',
            title: item.need,
            quote: textOrNull(item.quote),
            startSec: numberOrNull(item.startSec),
        }),
    );
}

/**
 * Пункты чек-листа, раскрытые в разговоре (true), — с местом из
 * свидетельств модели; места нет — пункт без цитаты и секунды.
 */
function checklistPoints(
    kind: 'hvost' | 'five_k',
    blocks: readonly ChecklistTextBlock[],
    steps: object | null | undefined,
    evidence: readonly AgentChecklistEvidenceDto[] | null | undefined,
): AnalysisPreviewPoint[] {
    const values: Json = isRecord(steps) ? steps : {};
    return blocks
        .filter(block => values[block.key] === true)
        .map((block): AnalysisPreviewPoint => {
            const place = evidence?.find(item => item.key === block.key);
            return {
                kind,
                title: block.label,
                quote: textOrNull(place?.quote),
                startSec: numberOrNull(place?.startSec),
            };
        });
}

function coverageOf(
    points: readonly AnalysisPreviewPoint[],
): AnalysisPreviewCoverage[] {
    return ANALYSIS_PREVIEW_POINT_KINDS.map(kind => {
        const own = points.filter(point => point.kind === kind);
        return {
            kind,
            total: own.length,
            withTime: own.filter(point => point.startSec !== null).length,
        };
    });
}

/** Оценки разделов действующего разбора (произвольный JSON записи ais). */
function scoresOf(before: unknown): Map<string, number | null> {
    const sections =
        isRecord(before) && Array.isArray(before.sections)
            ? before.sections.filter(isRecord)
            : [];
    const scores = new Map<string, number | null>();
    for (const section of sections) {
        if (typeof section.section === 'string') {
            scores.set(section.section, numberOrNull(section.score));
        }
    }
    return scores;
}

function sectionScores(
    dto: AgentCallAnalysisDto,
    before: unknown,
): AnalysisPreviewSectionScore[] {
    const was = scoresOf(before);
    const now = new Map<string, number | null>(
        (dto.sections ?? []).map(section => [
            section.section,
            numberOrNull(section.score),
        ]),
    );
    return CALL_REPORT_SECTIONS.map(section => ({
        section: section.code,
        title: section.title,
        before: was.get(section.code) ?? null,
        after: now.get(section.code) ?? null,
    })).filter(score => score.before !== null || score.after !== null);
}

export function buildAnalysisPreviewResult(input: {
    /** Проверочный разбор после приёма (prepareAgentAnalysis). */
    dto: AgentCallAnalysisDto;
    /** user_result действующего разбора звонка. */
    before: unknown;
    callType: string | null;
    durationSec: number | null;
    promptVersion: string;
}): AnalysisPreviewResult {
    const { dto } = input;
    const points = [
        ...sectionPoints(dto),
        ...needPoints(dto),
        ...checklistPoints(
            'hvost',
            HVOST_TEXT_BLOCKS,
            dto.hvostSteps,
            dto.hvostEvidence,
        ),
        ...checklistPoints(
            'five_k',
            FIVE_K_TEXT_BLOCKS,
            dto.fiveKItems,
            dto.fiveKEvidence,
        ),
    ];
    return {
        promptVersion: input.promptVersion,
        callType: input.callType,
        durationSec: input.durationSec,
        scoreBefore: isRecord(input.before)
            ? numberOrNull(input.before.score)
            : null,
        scoreAfter: numberOrNull(dto.score),
        sections: sectionScores(dto, input.before),
        points,
        coverage: coverageOf(points),
        incompleteParts: [...(dto.incompleteParts ?? [])],
        tokens: dto.usage?.tokens ?? null,
        longCall: readLongCallMark(dto.extra),
    };
}
