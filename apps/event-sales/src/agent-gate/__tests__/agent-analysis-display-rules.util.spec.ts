import { Logger } from '@nestjs/common';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { prepareAgentAnalysis } from '../services/agent-analysis-prepare.util';
import { applyScriptComplianceRule } from '../services/agent-analysis-display-rules.util';

const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;

const dtoOf = (
    overrides: Partial<AgentCallAnalysisDto> = {},
): AgentCallAnalysisDto =>
    ({
        callType: 'presentation',
        summary: 'Итог разговора',
        ...overrides,
    }) as AgentCallAnalysisDto;

describe('правила показа при записи разбора: соответствие скрипту', () => {
    beforeEach(() => jest.clearAllMocks());

    it('скрипта в разборе не было — процент модели обнуляется, признак false', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 40, scriptIncluded: false }),
            logger,
        );
        expect(fixed.scriptCompliance).toBeNull();
        expect(fixed.scriptIncluded).toBe(false);
        expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining('Соответствие скрипту 40% снято'),
        );
    });

    it('скрипт был — процент сохраняется', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 80, scriptIncluded: true }),
            logger,
        );
        expect(fixed.scriptCompliance).toBe(80);
        expect(fixed.scriptIncluded).toBe(true);
        expect(logger.log).not.toHaveBeenCalled();
    });

    it('признака нет (внешний агент, старый разбор при перезаписи) — процент не сохраняется', () => {
        const fixed = applyScriptComplianceRule(
            '1',
            dtoOf({ scriptCompliance: 55 }),
            logger,
        );
        expect(fixed.scriptCompliance).toBeNull();
        expect(fixed.scriptIncluded).toBe(false);
    });

    it('исходный разбор не мутируется', () => {
        const source = dtoOf({ scriptCompliance: 40 });
        applyScriptComplianceRule('1', source, logger);
        expect(source.scriptCompliance).toBe(40);
        expect(source.scriptIncluded).toBeUndefined();
    });

    it('общая подготовка разбора (приём, переразбор, догон) применяет правило', () => {
        const withoutScript = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 40, scriptIncluded: false }),
            null,
            logger,
        );
        expect(withoutScript.scriptCompliance).toBeNull();
        expect(withoutScript.scriptIncluded).toBe(false);

        const withScript = prepareAgentAnalysis(
            '1',
            'call-report-analyzer',
            dtoOf({ scriptCompliance: 90, scriptIncluded: true }),
            null,
            logger,
        );
        expect(withScript.scriptCompliance).toBe(90);
        expect(withScript.scriptIncluded).toBe(true);
    });
});
