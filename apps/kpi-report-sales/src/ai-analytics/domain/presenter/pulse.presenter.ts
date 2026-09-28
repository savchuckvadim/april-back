/**
 * PulseResult модели → AiPulseDto и применение периметра requester'а
 * (byManager и alerts — персональные строки; агрегаты отдела остаются).
 */
import { PulseResult } from '@lib/sales-ai-analytics';
import { AiPulseAlertDto, AiPulseDto } from '../../dto/ai-pulse.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';
import { PulseAlertDraft } from './pulse-alerts.util';

/**
 * Ссылки на карточки разборов сигналов: transcriptionId → URL элемента
 * смарта «AI-анализ звонков» (карта SmartLinkLoader.resolveLinks); нет
 * элемента или ссылки не построены → null. Остальные поля не меняются.
 */
export function withPulseAlertLinks(
    alerts: readonly PulseAlertDraft[],
    links: ReadonlyMap<string, string | null>,
): AiPulseAlertDto[] {
    return alerts.map(alert => ({
        ...alert,
        link: links.get(alert.transcriptionId) ?? null,
    }));
}

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
