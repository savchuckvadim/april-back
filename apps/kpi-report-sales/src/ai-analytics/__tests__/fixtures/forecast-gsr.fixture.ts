/**
 * «Случай gsr» (17.11.2026): отдел из 14 менеджеров, ноябрь 2026, на
 * 17.11 прошло 10 рабочих дней из 20, закрыто 4 продажи, учтённых звонков
 * 541 — на них старый расчёт ждал 37,6 продажи при 8,0 «по темпу» и 7,3
 * «в среднем за три месяца».
 *
 * История — устойчивая: 10 менеджеров отмечают по 20 уникальных
 * презентаций в месяц, 4 — по 10 (отдел 240), продаж 0,03 на презентацию
 * (отдел 7,2 в месяц). Половина месяца — половина презентаций.
 */
import type { PortalManagerMonth } from '../../domain/assembler/portal-model.types';
import { managerMonth } from './forecast-log.fixture';

export const GSR_MONTH = '2026-11';
export const GSR_DAY = '2026-11-17';
/** Ноябрь 2026 с праздником 4.11: 20 рабочих дней, к 17.11 прошло 10. */
export const GSR_HOLIDAYS = ['2026-11-04'];
export const GSR_MANAGERS = Array.from({ length: 14 }, (_, index) =>
    String(index + 1),
);

/** Учтённых звонков за 10 дней: 141, 140, 114 и остальные — всего 541. */
export const GSR_CALLS = [
    141, 140, 114, 14, 14, 14, 13, 13, 13, 13, 13, 13, 13, 13,
];

/** Месяцы истории подбора: 18 месяцев до ноября 2026. */
export const GSR_HISTORY = Array.from({ length: 18 }, (_, index) => {
    const month = 5 + index;
    const year = 2025 + Math.floor((month - 1) / 12);
    return `${year}-${String(((month - 1) % 12) + 1).padStart(2, '0')}`;
});

/** Презентаций в месяц у менеджера: первые 10 — по 20, остальные — по 10. */
export const gsrPresentations = (index: number): number =>
    index < 10 ? 20 : 10;

/** Снимок менеджера: презентации, продажи и звонки. */
function snapshot(
    managerId: string,
    monthKey: string,
    values: { presentations: number; sales: number; calls: number },
): PortalManagerMonth {
    return {
        ...managerMonth(managerId, monthKey, values.sales),
        presentations: values.presentations,
        presentationsAll: values.presentations,
        callsDone: values.calls,
        workedDays: 20,
    };
}

/** Все снимки случая: история и текущий месяц; звонки × `callsFactor`. */
export function gsrMonths(callsFactor = 1): PortalManagerMonth[] {
    return GSR_MANAGERS.flatMap((managerId, index) => {
        const presentations = gsrPresentations(index);
        const history = GSR_HISTORY.map(monthKey =>
            snapshot(managerId, monthKey, {
                presentations,
                sales: 0.03 * presentations,
                calls: 200,
            }),
        );
        const current = snapshot(managerId, GSR_MONTH, {
            presentations: presentations / 2,
            sales: index < 4 ? 1 : 0,
            calls: GSR_CALLS[index] * callsFactor,
        });

        return [...history, current];
    });
}
