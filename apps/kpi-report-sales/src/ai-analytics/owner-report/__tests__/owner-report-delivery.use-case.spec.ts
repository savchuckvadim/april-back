import { Logger } from '@nestjs/common';
import { OwnerReportDeliveryUseCase } from '../../domain/use-cases/owner-report-delivery.use-case';
import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import { buildOwnerReportMessage } from '../owner-report-message.util';

const upload = jest.fn();
jest.mock(
    '@lib/call-lib/call-report/weekly-report/call-report-weekly-delivery.service',
    () => ({
        CallReportWeeklyDeliveryService: class {
            upload = upload;
        },
    }),
);

const report = (): AiOwnerReportDto =>
    ({
        kind: 'month',
        periodKey: '2026-10',
        from: '2026-10-01',
        to: '2026-10-31',
        generatedAt: '2026-11-02T06:05:00.000Z',
        source: 'template',
        narrativeReason: null,
        availablePeriods: ['2026-10'],
        text: {
            title: 'Отчёт',
            periodLabel: '1–31 октября 2026',
            tiles: [
                {
                    code: 'analyzed',
                    value: '312',
                    label: 'разговоров разобрано',
                    compare: null,
                },
            ],
            summary: ['Первый абзац.', 'Второй абзац.', 'Третий абзац.'],
        },
    }) as AiOwnerReportDto;

const makeUseCase = (
    options: {
        enabled?: boolean;
        reportEnabled?: boolean;
        userIds?: number[];
        dryRun?: boolean;
        stored?: AiOwnerReportDto | null;
        sendFails?: boolean;
    } = {},
) => {
    const settings = {
        load: jest.fn().mockResolvedValue({
            enabled: options.enabled ?? true,
            calendar: { timeZone: 'Europe/Moscow' },
            ownerReport: {
                enabled: options.reportEnabled ?? true,
                kinds: ['month'],
                userIds: options.userIds ?? [447],
                diskFolderId: 15,
                dryRun: options.dryRun ?? false,
            },
        }),
    };
    const reader = {
        read: jest
            .fn()
            .mockResolvedValue(
                options.stored === undefined ? report() : options.stored,
            ),
    };
    const job = { execute: jest.fn().mockResolvedValue(report()) };
    const pdf = {
        render: jest.fn().mockResolvedValue({
            buffer: Buffer.from('%PDF'),
            filename: 'sales-report-month-2026-10.pdf',
            durationMs: 5,
        }),
    };
    const messageAdd = jest.fn(
        (): Promise<unknown> =>
            options.sendFails
                ? Promise.reject(new Error('нет прав'))
                : Promise.resolve({ result: 1 }),
    );
    const pbx = {
        init: jest
            .fn()
            .mockResolvedValue({ bitrix: { message: { add: messageAdd } } }),
    };
    const useCase = new OwnerReportDeliveryUseCase(
        settings as never,
        reader as never,
        job as never,
        pdf as never,
        pbx as never,
        { resolve: jest.fn().mockResolvedValue(null) } as never,
    );
    return { useCase, reader, job, pdf, messageAdd };
};

const DATA = {
    domain: 'test.bitrix24.ru',
    kind: 'month' as const,
    periodKey: '2026-10',
    date: '2026-11-03',
};

describe('OwnerReportDeliveryUseCase', () => {
    beforeEach(() => {
        upload
            .mockReset()
            .mockResolvedValue({ fileId: 7, fileUrl: 'https://disk/7' });
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('готовый снапшот → PDF на Диск → личные сообщения получателям из настроек', async () => {
        const { useCase, job, messageAdd } = makeUseCase();
        const result = await useCase.execute(DATA);
        expect(result).toEqual({
            kind: 'month',
            periodKey: '2026-10',
            status: 'sent',
            reason: null,
            delivered: [447],
            fileUrl: 'https://disk/7',
        });
        expect(job.execute).not.toHaveBeenCalled();
        expect(upload).toHaveBeenCalledWith(
            expect.anything(),
            'sales-report-month-2026-10.pdf',
            expect.any(Buffer),
            15,
        );
        expect(messageAdd).toHaveBeenCalledWith({
            DIALOG_ID: '447',
            MESSAGE: buildOwnerReportMessage({
                report: report(),
                fileUrl: 'https://disk/7',
            }),
        });
    });

    it('снапшота нет — собирает отчёт джобой по границам периода', async () => {
        const { useCase, job } = makeUseCase({ stored: null });
        await useCase.execute(DATA);
        expect(job.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'month',
                periodKey: '2026-10',
                from: '2026-10-01',
                to: '2026-10-31',
            }),
            expect.any(Date),
        );
    });

    it('«только считать» — файл есть, сообщений нет; явные получатели обходят режим', async () => {
        const dry = makeUseCase({ dryRun: true });
        expect(await dry.useCase.execute(DATA)).toMatchObject({
            status: 'dry_run',
            delivered: [],
        });
        expect(dry.messageAdd).not.toHaveBeenCalled();

        const explicit = makeUseCase({ dryRun: true, reportEnabled: false });
        expect(
            await explicit.useCase.execute({ ...DATA, recipients: [512] }),
        ).toMatchObject({
            status: 'sent',
            delivered: [512],
        });
    });

    it('пропуски: витрина выключена, выпуск выключен, получателей нет; сбой доставки — failed', async () => {
        expect(
            await makeUseCase({ enabled: false }).useCase.execute(DATA),
        ).toMatchObject({
            status: 'skipped',
            reason: 'ai-analytics-disabled',
        });
        expect(
            await makeUseCase({ reportEnabled: false }).useCase.execute(DATA),
        ).toMatchObject({
            status: 'skipped',
            reason: 'disabled',
        });
        expect(
            await makeUseCase({ userIds: [] }).useCase.execute(DATA),
        ).toMatchObject({
            status: 'skipped',
            reason: 'no-recipients',
        });
        expect(
            await makeUseCase({ sendFails: true }).useCase.execute(DATA),
        ).toMatchObject({
            status: 'failed',
            reason: 'not-delivered',
            fileUrl: 'https://disk/7',
        });
    });
});

describe('buildOwnerReportMessage', () => {
    it('заголовок с периодом, цифры шапки, два абзаца резюме, ссылка на файл', () => {
        const text = buildOwnerReportMessage({
            report: report(),
            fileUrl: 'https://disk/7',
        });
        expect(text).toContain(
            '[b]Отчёт по отделу продаж: 1–31 октября 2026[/b]',
        );
        expect(text).toContain('• [b]312[/b] — разговоров разобрано');
        expect(text).toContain('Первый абзац.');
        expect(text).toContain('Второй абзац.');
        expect(text).not.toContain('Третий абзац.');
        expect(text).toContain('[url=https://disk/7]PDF-отчёт на Диске[/url]');
        expect(
            buildOwnerReportMessage({ report: report(), fileUrl: null }),
        ).not.toContain('[url=');
    });
});
