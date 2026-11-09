/**
 * PulseResult модели → AiPulseDto и применение периметра requester'а
 * (byManager и alerts — персональные строки; агрегаты отдела остаются).
 */
import { PulseResult } from '@lib/sales-ai-analytics';
import { AiPulseCallRefDto } from '../../dto/ai-pulse-coach.dto';
import { AiPulseAlertDto, AiPulseDto } from '../../dto/ai-pulse.dto';
import { filterByPerimeter, RequesterAccess } from '../access/perimeter.util';
import type { PulseShortShare } from '../loaders/pulse-telephony.loader';
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

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Доля коротких разговоров по телефонии, %; телефония не ответила — null
 * (доля по выборке разборов не подставляется: короткие туда не попадают,
 * и там всегда около нуля).
 */
export function shortSharePct(share: PulseShortShare | null): number | null {
    if (!share) return null;
    return share.connected > 0
        ? round1((share.short / share.connected) * 100)
        : 0;
}

/** Звонок-пример по id: время, ссылка на разбор и оценка. */
export type PulseCallRefOf = (transcriptionId: string) => AiPulseCallRefDto;

const refWithoutLink: PulseCallRefOf = transcriptionId => ({
    transcriptionId,
    callStartedAt: null,
    link: null,
    score: null,
});

export function toPulseDto(
    endDate: string,
    result: PulseResult,
    alerts: AiPulseAlertDto[],
    shortShare: PulseShortShare | null = null,
    refOf: PulseCallRefOf = refWithoutLink,
): AiPulseDto {
    return {
        periodDate: endDate,
        window: result.window,
        nextStepDateRate: result.nextStepDateRate,
        previous: result.previous,
        xmr: result.xmr
            ? {
                  center: result.xmr.center,
                  ucl: result.xmr.ucl,
                  lcl: result.xmr.lcl,
                  state: result.xmr.state,
              }
            : null,
        analyzedCalls: result.analyzedCalls,
        shortCallsSharePct: shortSharePct(shortShare),
        connectedCalls: shortShare?.connected ?? null,
        minDurationSec: result.minDurationSec,
        managerMinN: result.managerMinN,
        byManager: result.byManager.map(row => ({
            managerId: row.managerId,
            analyzed: row.analyzed,
            nextStepDateRate: row.nextStepDateRate,
            examples: {
                noDate: row.noDateCallIds.map(refOf),
                withDate: row.dateCallId ? refOf(row.dateCallId) : null,
            },
        })),
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
