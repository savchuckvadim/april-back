import { Logger } from '@nestjs/common';
import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import { clampObjectionTimecodes } from '../services/agent-analysis-normalize.util';

/**
 * Таймкоды цитат возражений (Фаза 3, П6): секунда вне записи обнуляется
 * с предупреждением, разбор принимается; без длительности проверки нет.
 */
const dto = (
    objections: NonNullable<AgentCallAnalysisDto['objections']>,
): AgentCallAnalysisDto =>
    ({
        callType: 'presentation',
        objections,
    }) as unknown as AgentCallAnalysisDto;

function makeLogger() {
    const warn = jest.fn<void, [string]>();
    return { logger: { warn } as unknown as Logger, warn };
}

describe('clampObjectionTimecodes', () => {
    it('таймкоды внутри записи остаются, вне — обнуляются с одним warn', () => {
        const { logger, warn } = makeLogger();
        const result = clampObjectionTimecodes(
            't-1',
            dto([
                { objection: 'дорого', startSec: 30, endSec: 35 },
                { objection: 'позже', startSec: 200, endSec: 205 },
                { objection: 'наоборот', startSec: 40, endSec: 30 },
            ]),
            120,
            logger,
        );

        expect(result.objections).toEqual([
            { objection: 'дорого', startSec: 30, endSec: 35 },
            { objection: 'позже', startSec: null, endSec: null },
            { objection: 'наоборот', startSec: null, endSec: null },
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('2 возражений');
    });

    it('длительность неизвестна — таймкоды не трогаются; без возражений — тот же dto', () => {
        const { logger, warn } = makeLogger();
        const input = dto([{ objection: 'дорого', startSec: 9999 }]);

        expect(clampObjectionTimecodes('t-1', input, null, logger)).toEqual(
            input,
        );
        expect(warn).not.toHaveBeenCalled();
        const empty = dto([]);
        expect(clampObjectionTimecodes('t-1', empty, 120, logger)).toBe(empty);
    });
});
