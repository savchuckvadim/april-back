import { EventReportContext } from '../services/context/event-report.context';

/** Минимальный контекст: важны presentation-флаги и currentPresDeal. */
const makeCtx = (input: {
    isPresentationDone: boolean;
    reportEventType?: string;
    currentPresDeal?: { ID: string } | null;
}) =>
    new EventReportContext(
        {
            presentation: { isPresentationDone: input.isPresentationDone },
            currentTask: input.reportEventType
                ? { eventType: input.reportEventType }
                : undefined,
            report: {},
        } as never,
        {} as never,
        {
            entityType: 'deal',
            entityId: 10,
            currentPresDeal: input.currentPresDeal ?? null,
        } as never,
    );

describe('EventReportContext.isUnplannedPresentation (fallback)', () => {
    it('кнопка «проведена презентация» при отчёте не-презентации → unplanned', () => {
        const ctx = makeCtx({
            isPresentationDone: true,
            reportEventType: 'xo',
        });
        expect(ctx.isUnplannedPresentation).toBe(true);
    });

    it('отчёт «презентация» БЕЗ живой pres-сделки → fallback на unplanned', () => {
        // Регресс «Ахтунг»-бага: сделка из ХО-лида, презентаций ещё не было —
        // событие раньше молча терялось (ни pres-сделки, ни KPI).
        const ctx = makeCtx({
            isPresentationDone: true,
            reportEventType: 'presentation',
            currentPresDeal: null,
        });
        expect(ctx.isUnplannedPresentation).toBe(true);
    });

    it('отчёт «презентация» с живой pres-сделкой → штатная ветка, не unplanned', () => {
        const ctx = makeCtx({
            isPresentationDone: true,
            reportEventType: 'presentation',
            currentPresDeal: { ID: '77' },
        });
        expect(ctx.isUnplannedPresentation).toBe(false);
    });

    it('без флага isPresentationDone ничего не срабатывает', () => {
        const ctx = makeCtx({
            isPresentationDone: false,
            reportEventType: 'presentation',
        });
        expect(ctx.isUnplannedPresentation).toBe(false);
    });
});
