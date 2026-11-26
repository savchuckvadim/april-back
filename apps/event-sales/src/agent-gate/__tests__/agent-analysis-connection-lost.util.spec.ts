import { Logger } from '@nestjs/common';
import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
    CALL_REPORT_RISK_FLAG_DOOR_CLOSED,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type {
    AgentCallAnalysisDto,
    AgentSectionAnalysisDto,
    AgentRiskEvidenceDto,
} from '../dto/agent-analysis-request.dto';
import {
    applyConnectionLostRules,
    dropDoorClosedFlag,
    neutralizeUnreachedSections,
} from '../services/agent-analysis-connection-lost.util';
import { normalizeAgentAnalysis } from '../services/agent-analysis-normalize.util';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): код страхует разбор, если
 * модель не послушалась задания. Исход «связь прервалась» делает закрытие и
 * работу с отказом неактуальными; отмеченный обрыв (исход ИЛИ сбой) снимает
 * флаг «не оставил дверь открытой». Без обрыва разбор не меняется.
 */
const LOST = CALL_REPORT_OUTCOME_CONNECTION_LOST;
const DOOR = CALL_REPORT_RISK_FLAG_DOOR_CLOSED;

const section = (
    code: AgentSectionAnalysisDto['section'],
    relevance: number,
    score?: number,
): AgentSectionAnalysisDto => ({
    section: code,
    relevance,
    ...(score === undefined ? {} : { score }),
    analysis: `разбор ${code}`,
    asWas: `как было ${code}`,
    weaknesses: `слабое ${code}`,
    advice: `совет ${code}`,
    alternatives: ['вариант'],
    quote: 'цитата',
    startSec: 5,
});

const evidence = (flag: AgentRiskEvidenceDto['flag']): AgentRiskEvidenceDto =>
    ({ flag, quote: 'Ладно, тогда до свидания', speaker: 'client' }) as never;

const dto = (patch: Partial<AgentCallAnalysisDto>): AgentCallAnalysisDto =>
    ({
        callType: 'cold',
        summary: 'итог',
        score: 62,
        sections: [
            section('GREETING', 80, 7),
            section('CLOSING', 90, 8),
            section('REFUSAL', 60, 3),
        ],
        ...patch,
    }) as AgentCallAnalysisDto;

const issue = (code: string) => ({ code, quote: 'цитата' }) as never;

function makeLogger() {
    const log = jest.fn<void, [string]>();
    const warn = jest.fn<void, [string]>();
    return { logger: { log, warn } as unknown as Logger, log, warn };
}

const byCode = (
    result: AgentCallAnalysisDto,
    code: AgentSectionAnalysisDto['section'],
) => result.sections?.find(item => item.section === code);

describe('neutralizeUnreachedSections: исход «связь прервалась» (случай А)', () => {
    it('закрытие и отказ с актуальностью > 0 становятся неактуальными: без оценки, текстов и цитаты', () => {
        const { logger, log } = makeLogger();
        const result = neutralizeUnreachedSections(
            'transcription 77',
            dto({ outcome: LOST }),
            logger,
        );

        expect(byCode(result, 'CLOSING')).toEqual({
            section: 'CLOSING',
            relevance: 0,
        });
        expect(byCode(result, 'REFUSAL')).toEqual({
            section: 'REFUSAL',
            relevance: 0,
        });
        // Каждое срабатывание — строка журнала с номером расшифровки.
        expect(log).toHaveBeenCalledTimes(2);
        expect(log.mock.calls[0][0]).toContain('CLOSING');
        expect(log.mock.calls[0][0]).toContain('transcription 77');
    });

    it('остальные разделы и итоговая оценка не трогаются; исходный dto не мутируется', () => {
        const { logger } = makeLogger();
        const source = dto({ outcome: LOST });
        const result = neutralizeUnreachedSections('t', source, logger);

        expect(byCode(result, 'GREETING')).toBe(byCode(source, 'GREETING'));
        expect(result.score).toBe(62);
        expect(byCode(source, 'CLOSING')?.relevance).toBe(90);
        expect(byCode(source, 'CLOSING')?.score).toBe(8);
    });

    it('идемпотентна: повторный вызов возвращает тот же dto и молчит', () => {
        const { logger, log } = makeLogger();
        const once = neutralizeUnreachedSections(
            't',
            dto({ outcome: LOST }),
            logger,
        );
        log.mockClear();
        const twice = neutralizeUnreachedSections('t', once, logger);

        expect(twice).toBe(once);
        expect(log).not.toHaveBeenCalled();
    });

    it('раздел, который уже неактуален, остаётся как есть (с оценкой модели не «чистится»)', () => {
        const { logger, log } = makeLogger();
        const source = dto({
            outcome: LOST,
            sections: [{ section: 'CLOSING', relevance: 0 }],
        });
        const result = neutralizeUnreachedSections('t', source, logger);

        expect(result).toBe(source);
        expect(log).not.toHaveBeenCalled();
    });

    it('обрыв только сбоем (исход — отказ или договорились) закрытие и отказ не трогает', () => {
        const { logger, log } = makeLogger();
        const source = dto({
            outcome: 'advanced',
            issues: [issue(CALL_REPORT_ISSUE_CONNECTION_LOST)],
        });
        const result = neutralizeUnreachedSections('t', source, logger);

        expect(result).toBe(source);
        expect(byCode(result, 'CLOSING')?.relevance).toBe(90);
        expect(log).not.toHaveBeenCalled();
    });

    it('без обрыва разбор не меняется', () => {
        const { logger, log } = makeLogger();
        for (const outcome of ['advanced', 'refused', 'no_contact', null]) {
            const source = dto({ outcome: outcome as never });
            expect(neutralizeUnreachedSections('t', source, logger)).toBe(
                source,
            );
        }
        const withoutOutcome = dto({});
        expect(neutralizeUnreachedSections('t', withoutOutcome, logger)).toBe(
            withoutOutcome,
        );
        expect(log).not.toHaveBeenCalled();
    });

    it('разбор без разделов не падает', () => {
        const { logger } = makeLogger();
        const source = dto({ outcome: LOST, sections: undefined });
        expect(neutralizeUnreachedSections('t', source, logger)).toBe(source);
    });
});

describe('dropDoorClosedFlag: отмеченный обрыв (случай Б)', () => {
    const withDoor = (patch: Partial<AgentCallAnalysisDto>) =>
        dto({
            riskFlags: ['conflict', DOOR],
            riskEvidence: [evidence('conflict'), evidence(DOOR)],
            ...patch,
        });

    it('исход «связь прервалась»: флаг и его доказательство снимаются, чужие остаются', () => {
        const { logger, log } = makeLogger();
        const result = dropDoorClosedFlag(
            'transcription 5',
            withDoor({ outcome: LOST }),
            logger,
        );

        expect(result.riskFlags).toEqual(['conflict']);
        expect(result.riskEvidence?.map(item => item.flag)).toEqual([
            'conflict',
        ]);
        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0][0]).toContain('transcription 5');
    });

    it('сбой «связь прервалась» при другом исходе: флаг тоже снимается', () => {
        const { logger } = makeLogger();
        const result = dropDoorClosedFlag(
            't',
            withDoor({
                outcome: 'refused',
                issues: [issue(CALL_REPORT_ISSUE_CONNECTION_LOST)],
            }),
            logger,
        );

        expect(result.riskFlags).toEqual(['conflict']);
    });

    it('без обрыва флаг остаётся вместе с доказательством', () => {
        const { logger, log } = makeLogger();
        const source = withDoor({
            outcome: 'refused',
            issues: [issue('telephony')],
        });
        const result = dropDoorClosedFlag('t', source, logger);

        expect(result).toBe(source);
        expect(result.riskFlags).toEqual(['conflict', DOOR]);
        expect(log).not.toHaveBeenCalled();
    });

    it('идемпотентна', () => {
        const { logger, log } = makeLogger();
        const once = dropDoorClosedFlag(
            't',
            withDoor({ outcome: LOST }),
            logger,
        );
        log.mockClear();

        expect(dropDoorClosedFlag('t', once, logger)).toBe(once);
        expect(log).not.toHaveBeenCalled();
    });

    it('обрыв отмечен, но флага «дверь» нет — разбор тот же, журнал пуст', () => {
        const { logger, log } = makeLogger();
        const source = dto({ outcome: LOST, riskFlags: ['conflict'] });

        expect(dropDoorClosedFlag('t', source, logger)).toBe(source);
        expect(log).not.toHaveBeenCalled();
    });
});

describe('applyConnectionLostRules и приём разбора', () => {
    it('исход «связь прервалась»: разделы и флаг — за один шаг; оценка не пересчитывается', () => {
        const { logger } = makeLogger();
        const result = applyConnectionLostRules(
            't',
            dto({
                outcome: LOST,
                riskFlags: [DOOR],
                riskEvidence: [evidence(DOOR)],
            }),
            logger,
        );

        expect(byCode(result, 'CLOSING')?.relevance).toBe(0);
        expect(result.riskFlags).toEqual([]);
        expect(result.score).toBe(62);
    });

    it('normalizeAgentAnalysis: правило работает на всех путях записи (после проверки флагов цитатой)', () => {
        const { logger } = makeLogger();
        const result = normalizeAgentAnalysis(
            'tr-1',
            'agent',
            dto({
                outcome: LOST,
                riskFlags: [DOOR],
                riskEvidence: [evidence(DOOR)],
            }),
            logger,
        );

        expect(byCode(result, 'CLOSING')).toEqual({
            section: 'CLOSING',
            relevance: 0,
        });
        expect(byCode(result, 'GREETING')?.score).toBe(7);
        expect(result.riskFlags).toEqual([]);
        expect(result.score).toBe(62);
    });

    it('normalizeAgentAnalysis без обрыва: закрытие и флаг «дверь» остаются как были', () => {
        const { logger } = makeLogger();
        const result = normalizeAgentAnalysis(
            'tr-2',
            'agent',
            dto({
                outcome: 'refused',
                riskFlags: [DOOR],
                riskEvidence: [evidence(DOOR)],
            }),
            logger,
        );

        expect(byCode(result, 'CLOSING')?.relevance).toBe(90);
        expect(byCode(result, 'CLOSING')?.score).toBe(8);
        expect(result.riskFlags).toEqual([DOOR]);
    });
});
