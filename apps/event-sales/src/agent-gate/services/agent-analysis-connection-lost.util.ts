import { Logger } from '@nestjs/common';
import {
    CALL_REPORT_CONNECTION_LOST_UNREACHED_SECTIONS,
    CALL_REPORT_RISK_FLAG_DOOR_CLOSED,
    isConnectionLostOutcome,
    isConnectionLostReported,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AgentCallAnalysisDto,
    AgentSectionAnalysisDto,
} from '../dto/agent-analysis-request.dto';

/**
 * Обрыв связи — не вина менеджера (решение владельца 26.11.2026). Модель
 * может не послушаться правила из задания, поэтому код страхует разбор при
 * приёме и в фокус-разборе (до ограничителей методики):
 * - исход «связь прервалась» (оборвалось до результата): закрытие и работа с
 *   отказом — недостижимые этапы, актуальность 0 без оценки и советов;
 * - отмечен обрыв (исход ИЛИ сбой): флаг «не оставил дверь открытой» снимается
 *   вместе с доказательством — возможности оставить дверь открытой не было.
 * `where` — чей разбор, для журнала: «transcription N» при приёме и
 * «Фокус-разбор (портал)» в фокус-разборе, где номера расшифровки ещё нет.
 * Итоговая оценка здесь не пересчитывается. Чистые идемпотентные функции:
 * исходный dto не мутируется, повторный вызов ничего не меняет.
 */

const UNREACHED: ReadonlySet<string> = new Set(
    CALL_REPORT_CONNECTION_LOST_UNREACHED_SECTIONS,
);

const isLiveUnreached = (section: AgentSectionAnalysisDto): boolean =>
    UNREACHED.has(section.section) && section.relevance > 0;

/**
 * Раздел, которого разговор не достиг: актуальность 0, без оценки, текстов,
 * советов и цитаты — так выглядит недостижимый этап, о котором модель
 * следовала заданию («relevance 0 — БЕЗ оценки и БЕЗ советов»).
 */
const unreachedOf = (
    section: AgentSectionAnalysisDto,
): AgentSectionAnalysisDto => ({
    section: section.section,
    relevance: 0,
});

/**
 * Случай А — исход «связь прервалась»: актуальные закрытие и работа с
 * отказом становятся неактуальными. Строка в журнал на каждый раздел.
 */
export function neutralizeUnreachedSections(
    where: string,
    dto: AgentCallAnalysisDto,
    logger: Pick<Logger, 'log'>,
): AgentCallAnalysisDto {
    if (!isConnectionLostOutcome(dto) || !dto.sections?.some(isLiveUnreached)) {
        return dto;
    }
    const sections = dto.sections.map(section => {
        if (!isLiveUnreached(section)) return section;
        logger.log(
            `Обрыв связи: раздел ${section.section} (актуальность ${section.relevance}) ` +
                `стал неактуальным — разговор до него не дошёл (${where})`,
        );
        return unreachedOf(section);
    });
    return { ...dto, sections };
}

/**
 * Случай Б — отмечен обрыв связи (исход или сбой): флаг «не оставил дверь
 * открытой» и его доказательство снимаются. Строка в журнал.
 */
export function dropDoorClosedFlag(
    where: string,
    dto: AgentCallAnalysisDto,
    logger: Pick<Logger, 'log'>,
): AgentCallAnalysisDto {
    if (!isConnectionLostReported(dto)) return dto;
    const isDoor = (flag: string): boolean =>
        flag === CALL_REPORT_RISK_FLAG_DOOR_CLOSED;
    const hasFlag = dto.riskFlags?.some(isDoor) === true;
    const hasEvidence = dto.riskEvidence?.some(item => isDoor(item.flag));
    if (!hasFlag && !hasEvidence) return dto;
    logger.log(
        `Обрыв связи: флаг ${CALL_REPORT_RISK_FLAG_DOOR_CLOSED} снят — ` +
            `оставить дверь открытой было нельзя (${where})`,
    );
    return {
        ...dto,
        ...(dto.riskFlags
            ? { riskFlags: dto.riskFlags.filter(flag => !isDoor(flag)) }
            : {}),
        ...(dto.riskEvidence
            ? {
                  riskEvidence: dto.riskEvidence.filter(
                      item => !isDoor(item.flag),
                  ),
              }
            : {}),
    };
}

/** Все правила обрыва связи за один шаг — так их зовут и приём, и фокус-разбор. */
export function applyConnectionLostRules(
    where: string,
    dto: AgentCallAnalysisDto,
    logger: Pick<Logger, 'log'>,
): AgentCallAnalysisDto {
    return dropDoorClosedFlag(
        where,
        neutralizeUnreachedSections(where, dto, logger),
        logger,
    );
}
