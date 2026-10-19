import { Logger } from '@nestjs/common';
import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { normalizeAgentAnalysis } from '../services/agent-analysis-normalize.util';
import {
    clampRiskEvidenceTimecodes,
    reconcileRiskFlags,
} from '../services/agent-analysis-risk.util';

/**
 * Риск-флаги при приёме разбора (решение владельца 19.10.2026): флаг
 * без доказательства-цитаты снимается, дубли схлопываются, чужие
 * доказательства отбрасываются; таймкоды доказательств — внутри записи.
 */
const dto = (patch: Partial<AgentCallAnalysisDto>): AgentCallAnalysisDto =>
    ({
        callType: 'cold',
        summary: 'итог',
        needsFound: false,
        presentationDone: false,
        ...patch,
    }) as AgentCallAnalysisDto;

function makeLogger() {
    const warn = jest.fn<void, [string]>();
    const log = jest.fn<void, [string]>();
    return { logger: { warn, log } as unknown as Logger, warn, log };
}

describe('reconcileRiskFlags', () => {
    it('флаг с цитатой остаётся, флаг без доказательства снимается с warn-счётчиком', () => {
        const { logger, warn } = makeLogger();
        const result = reconcileRiskFlags(
            't-1',
            dto({
                riskFlags: ['conflict', 'promise', 'door_closed'],
                riskEvidence: [
                    {
                        flag: 'conflict',
                        quote: 'Да вы меня вообще не слушаете',
                        speaker: 'manager',
                        startSec: 10,
                        endSec: 14,
                    },
                    // Пустая цитата — доказательства нет.
                    { flag: 'promise', quote: '   ', speaker: 'manager' },
                ],
            }),
            logger,
        );

        expect(result.riskFlags).toEqual(['conflict']);
        expect(result.riskEvidence).toEqual([
            {
                flag: 'conflict',
                quote: 'Да вы меня вообще не слушаете',
                speaker: 'manager',
                startSec: 10,
                endSec: 14,
            },
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('сняты (2)');
        expect(warn.mock.calls[0]?.[0]).toContain('promise, door_closed');
    });

    it('дубли флагов и доказательств схлопываются, доказательства чужих флагов отбрасываются', () => {
        const { logger, log, warn } = makeLogger();
        const result = reconcileRiskFlags(
            't-1',
            dto({
                riskFlags: ['client_negative', 'client_negative'],
                riskEvidence: [
                    {
                        flag: 'client_negative',
                        quote: 'Не звоните',
                        speaker: 'client',
                    },
                    {
                        flag: 'client_negative',
                        quote: 'Не звоните',
                        speaker: 'client',
                    },
                    {
                        flag: 'conflict',
                        quote: 'Чужая цитата',
                        speaker: 'manager',
                    },
                ],
            }),
            logger,
        );

        expect(result.riskFlags).toEqual(['client_negative']);
        expect(result.riskEvidence).toHaveLength(1);
        expect(warn).not.toHaveBeenCalled();
        expect(log.mock.calls.map(call => call[0]).join('\n')).toContain(
            'Повторы риск-флагов схлопнуты: 1',
        );
    });

    it('разбор без флагов и доказательств не трогается; без доказательств все флаги снимаются', () => {
        const { logger, warn } = makeLogger();
        const untouched = dto({});
        expect(reconcileRiskFlags('t-1', untouched, logger)).toBe(untouched);

        const result = reconcileRiskFlags(
            't-1',
            dto({ riskFlags: ['promise'] }),
            logger,
        );
        expect(result.riskFlags).toEqual([]);
        expect(result.riskEvidence).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('сверка встроена в общую нормализацию приёма', () => {
        const { logger } = makeLogger();
        const result = normalizeAgentAnalysis(
            't-1',
            'agent',
            dto({ riskFlags: ['compliance'], riskEvidence: [] }),
            logger,
        );
        expect(result.riskFlags).toEqual([]);
    });
});

describe('clampRiskEvidenceTimecodes', () => {
    it('таймкоды вне записи обнуляются с одним warn, цитата остаётся', () => {
        const { logger, warn } = makeLogger();
        const result = clampRiskEvidenceTimecodes(
            't-1',
            dto({
                riskEvidence: [
                    {
                        flag: 'conflict',
                        quote: 'a',
                        speaker: 'manager',
                        startSec: 5,
                        endSec: 9,
                    },
                    {
                        flag: 'conflict',
                        quote: 'b',
                        speaker: 'manager',
                        startSec: 500,
                        endSec: 505,
                    },
                ],
            }),
            120,
            logger,
        );

        expect(result.riskEvidence).toEqual([
            {
                flag: 'conflict',
                quote: 'a',
                speaker: 'manager',
                startSec: 5,
                endSec: 9,
            },
            {
                flag: 'conflict',
                quote: 'b',
                speaker: 'manager',
                startSec: null,
                endSec: null,
            },
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('1 доказательств');
    });

    it('без доказательств — тот же dto; длительность неизвестна — таймкоды не трогаются', () => {
        const { logger, warn } = makeLogger();
        const empty = dto({ riskEvidence: [] });
        expect(clampRiskEvidenceTimecodes('t-1', empty, 120, logger)).toBe(
            empty,
        );
        const input = dto({
            riskEvidence: [
                {
                    flag: 'promise',
                    quote: 'x',
                    speaker: 'manager',
                    startSec: 9999,
                },
            ],
        });
        expect(clampRiskEvidenceTimecodes('t-1', input, null, logger)).toEqual(
            input,
        );
        expect(warn).not.toHaveBeenCalled();
    });
});
