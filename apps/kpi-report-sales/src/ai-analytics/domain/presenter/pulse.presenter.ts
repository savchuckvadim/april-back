/**
 * PulseResult модели → AiPulseDto и применение периметра requester'а
 * (byManager и alerts — персональные строки; агрегаты отдела остаются).
 */
import { PulseResult } from '@lib/sales-ai-analytics';
import { AiPulseAlertDto, AiPulseDto } from '../../dto/ai-pulse.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';

export function toPulseDto(
    endDate: string,
    result: PulseResult,
    alerts: AiPulseAlertDto[],
): AiPulseDto {
    return {
        periodDate: endDate,
        window: result.window,
        nextStepDateRate: result.nextStepDateRate,
        xmr: result.xmr
            ? {
                  center: result.xmr.center,
                  ucl: result.xmr.ucl,
                  lcl: result.xmr.lcl,
                  state: result.xmr.state,
              }
            : null,
        analyzedCalls: result.analyzedCalls,
        shortCallsSharePct: result.shortCallsSharePct,
        byManager: result.byManager,
        alerts,
    };
}

export function applyPulsePerimeter(
    dto: AiPulseDto,
    access: RequesterAccess,
): AiPulseDto {
    return {
        ...dto,
        byManager: filterByPerimeter(dto.byManager, access),
        alerts: filterByPerimeter(dto.alerts, access),
    };
}
