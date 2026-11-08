import type { OwnerReportExportJobData } from '@lib/sales-ai-analytics';
import { OwnerReportExportUseCase } from '../../domain/use-cases/owner-report-export.use-case';

const DATA: OwnerReportExportJobData = {
    domain: 'gsr.bitrix24.ru',
    kind: 'month',
    periodKey: '2026-10',
    forceRefresh: true,
};

const makeUseCase = (options: { renderFails?: boolean } = {}) => {
    const report = { kind: 'month', periodKey: '2026-10' };
    const source = { get: jest.fn().mockResolvedValue(report) };
    const pdf = {
        render: options.renderFails
            ? jest.fn().mockRejectedValue(new Error('шрифт не найден'))
            : jest.fn().mockResolvedValue({
                  buffer: Buffer.from('%PDF-1.4'),
                  filename: 'sales-report-month-2026-10.pdf',
                  durationMs: 10,
              }),
    };
    const settings = {
        load: jest
            .fn()
            .mockResolvedValue({ calendar: { timeZone: 'Asia/Irkutsk' } }),
    };
    const states: string[] = [];
    const store = {
        writeState: jest.fn(
            (_target: unknown, patch: { status: string; message?: string }) => {
                states.push(patch.status);
                return Promise.resolve({ ...patch });
            },
        ),
        writePdf: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new OwnerReportExportUseCase(
        source as never,
        pdf as never,
        settings as never,
        store as never,
    );
    return { useCase, source, pdf, store, states };
};

describe('OwnerReportExportUseCase — PDF отчёта для админки', () => {
    it('собирает отчёт заново по forceRefresh, кладёт PDF и отмечает ready', async () => {
        const { useCase, source, pdf, store, states } = makeUseCase();
        const state = await useCase.execute(DATA);
        expect(source.get).toHaveBeenCalledWith(DATA, true, expect.any(Date));
        // PDF рисуется в поясе портала.
        expect(pdf.render).toHaveBeenCalledWith(
            expect.anything(),
            'Asia/Irkutsk',
        );
        expect(store.writePdf).toHaveBeenCalledWith(
            DATA,
            Buffer.from('%PDF-1.4'),
        );
        expect(states).toEqual(['processing', 'ready']);
        expect(state).toMatchObject({
            status: 'ready',
            filename: 'sales-report-month-2026-10.pdf',
            sizeBytes: 8,
        });
    });

    it('ошибка сборки — состояние error с текстом, джоба не падает', async () => {
        const { useCase, store, states } = makeUseCase({ renderFails: true });
        const state = await useCase.execute(DATA);
        expect(states).toEqual(['processing', 'error']);
        expect(state).toMatchObject({
            status: 'error',
            message: 'шрифт не найден',
        });
        expect(store.writePdf).not.toHaveBeenCalled();
    });
});
