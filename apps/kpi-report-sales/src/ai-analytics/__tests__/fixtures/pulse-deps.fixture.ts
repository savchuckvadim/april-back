import {
    DEFAULT_WORK_CALENDAR,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import type { AiAnalyticsCalendarLoader } from '../../domain/loaders/calendar.loader';
import type {
    PulseShortShare,
    PulseTelephonyLoader,
} from '../../domain/loaders/pulse-telephony.loader';

/** Загрузчик производственного календаря с заданным календарём. */
export function calendarLoaderWith(
    calendar: WorkCalendar = DEFAULT_WORK_CALENDAR,
): { loader: AiAnalyticsCalendarLoader; load: jest.Mock } {
    const load = jest.fn().mockResolvedValue({
        calendar,
        dayHours: 9,
        source: 'import',
        warnings: [],
    });
    return { loader: { load } as unknown as AiAnalyticsCalendarLoader, load };
}

/** Телефония пульса: заданная доля коротких; по умолчанию не ответила. */
export function telephonyWith(share: PulseShortShare | null = null): {
    loader: PulseTelephonyLoader;
    shortShare: jest.Mock;
} {
    const shortShare = jest.fn().mockResolvedValue(share);
    return {
        loader: { shortShare } as unknown as PulseTelephonyLoader,
        shortShare,
    };
}
