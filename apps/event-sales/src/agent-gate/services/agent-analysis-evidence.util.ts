import { Logger } from '@nestjs/common';
import { callTypeHasChecklists, type TranscriptSegment } from '@lib/call-lib';
import {
    EVIDENCE_CHECKS,
    evidenceIndexOf,
    verifyEvidenceTime,
    type EvidenceCheck,
    type TranscriptAnchorIndex,
} from '@lib/call-lib/call-report/transcript-anchor';
import type {
    AgentCallAnalysisDto,
    AgentChecklistEvidenceDto,
} from '../dto/agent-analysis-request.dto';

/**
 * Места разбора в разговоре (задание focus-v3.4): цитата и секунда у
 * разделов, потребностей и пунктов «хвоста» и 5К проверяются по расшифровке
 * при приёме разбора — на страницу попадает только проверенная секунда
 * (@lib/call-lib transcript-anchor: найдено по тексту → секунда реплики;
 * слова рядом со временем → секунда модели; иначе секунда снимается).
 * Места пунктов чек-листа — только у пунктов со значением true, по одному
 * на пункт. Итог проверки — одной строкой в журнал: так видно, сколько
 * секунд модель выдумывает. Разбор без мест не меняется. Чистые функции.
 */

/** Что известно о записи для проверки: длительность и реплики. */
export interface AnalysisTiming {
    durationSec: number | null;
    segments: readonly TranscriptSegment[] | null;
}

/** Счётчики итогов проверки и поправок времени по тексту. */
type EvidenceTally = Record<EvidenceCheck, number> & { snapped: number };

interface EvidencePlace {
    quote?: string | null;
    startSec?: number | null;
}

const cleanQuote = (quote: string | null | undefined): string | null =>
    typeof quote === 'string' && quote.trim() !== '' ? quote.trim() : null;

const hasPlace = (item: EvidencePlace): boolean =>
    item.quote !== undefined || item.startSec !== undefined;

class EvidenceChecker {
    readonly tally: EvidenceTally = {
        ...(Object.fromEntries(
            EVIDENCE_CHECKS.map(check => [check, 0]),
        ) as Record<EvidenceCheck, number>),
        snapped: 0,
    };

    constructor(
        private readonly index: TranscriptAnchorIndex | null,
        private readonly durationSec: number | null,
    ) {}

    /** Место с проверенной секундой; цитата — без пробелов по краям. */
    place<T extends EvidencePlace>(item: T): T {
        const quote = cleanQuote(item.quote);
        const time = verifyEvidenceTime(
            this.index,
            quote,
            item.startSec,
            this.durationSec,
        );
        this.tally[time.check] += 1;
        if (time.snapped) this.tally.snapped += 1;
        return { ...item, quote, startSec: time.startSec };
    }
}

/**
 * Места пунктов чек-листа: только пункты со значением true, по одному на
 * пункт, с цитатой; чек-листа нет — null.
 */
function checklistPlaces(
    checker: EvidenceChecker,
    steps: object | null | undefined,
    evidence: readonly AgentChecklistEvidenceDto[] | null | undefined,
): AgentChecklistEvidenceDto[] | null {
    if (steps === null || steps === undefined) return null;
    const values = steps as Readonly<Record<string, unknown>>;
    const seen = new Set<string>();
    const kept: AgentChecklistEvidenceDto[] = [];
    for (const item of evidence ?? []) {
        if (values[item.key] !== true || seen.has(item.key)) continue;
        if (cleanQuote(item.quote) === null) continue;
        seen.add(item.key);
        kept.push(checker.place(item));
    }
    return kept;
}

/**
 * Есть ли в разборе места разговора. Списки, обнулённые правилом
 * чек-листов (не презентация), местами не считаются.
 */
const hasEvidence = (dto: AgentCallAnalysisDto): boolean =>
    (dto.sections ?? []).some(hasPlace) ||
    [dto.needItems, dto.hvostEvidence, dto.fiveKEvidence].some(list =>
        Array.isArray(list),
    );

function tallyLine(tally: EvidenceTally): string {
    return (
        `по тексту ${tally.text}, рядом со временем ${tally.near}, ` +
        `без сверки ${tally.unchecked}, без цитаты ${tally.no_quote}, ` +
        `места нет ${tally.dropped}, время поправлено по тексту ${tally.snapped}`
    );
}

/**
 * Пометка журнала: итоговый тип — презентация, а задание с цитатами
 * строилось по другому типу, поэтому «хвоста» и 5К в разборе нет. Так
 * видно, как часто тип меняется после синтеза.
 */
function taskTypeNote(dto: AgentCallAnalysisDto): string {
    const task = dto.taskCallType;
    if (
        task === undefined ||
        !callTypeHasChecklists(dto.callType) ||
        callTypeHasChecklists(task)
    ) {
        return '';
    }
    return (
        `; итоговый тип «${dto.callType}», задание — по типу «${task ?? 'не определён'}»: ` +
        '«хвоста» и 5К в разборе нет'
    );
}

/** Проверка мест разбора по расшифровке; разбор без мест — как есть. */
export function verifyAnalysisEvidence(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    timing: AnalysisTiming,
    logger: Logger,
): AgentCallAnalysisDto {
    if (!hasEvidence(dto)) return dto;
    const checker = new EvidenceChecker(
        evidenceIndexOf(timing.segments),
        timing.durationSec,
    );
    const sections = dto.sections?.map(section =>
        hasPlace(section) ? checker.place(section) : section,
    );
    const needItems = dto.needItems?.map(item => checker.place(item));
    const checked: AgentCallAnalysisDto = {
        ...dto,
        ...(sections ? { sections } : {}),
        ...(needItems ? { needItems } : {}),
        ...(Array.isArray(dto.hvostEvidence)
            ? {
                  hvostEvidence: checklistPlaces(
                      checker,
                      dto.hvostSteps,
                      dto.hvostEvidence,
                  ),
              }
            : {}),
        ...(Array.isArray(dto.fiveKEvidence)
            ? {
                  fiveKEvidence: checklistPlaces(
                      checker,
                      dto.fiveKItems,
                      dto.fiveKEvidence,
                  ),
              }
            : {}),
    };
    logger.log(
        `Цитаты разбора (transcription ${transcriptionId}): ${tallyLine(checker.tally)}` +
            taskTypeNote(dto),
    );
    return checked;
}
