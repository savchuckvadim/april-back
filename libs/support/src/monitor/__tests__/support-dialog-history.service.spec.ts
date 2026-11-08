import { Prisma } from 'generated/prisma';
import {
    SUPPORT_HISTORY_TABLE_MISSING,
    SupportDialogHistoryService,
} from '../application/support-dialog-history.service';
import type { SupportMonitorRunReport } from '../application/support-monitor.report';
import { SupportDialogHistoryRepository } from '../infrastructure/support-dialog-history.repository';

const LINE = 'april-dev.bitrix24.ru';
const NOW = new Date('2026-11-08T12:00:00Z');

const tableMissing = () =>
    new Prisma.PrismaClientKnownRequestError('table missing', {
        code: 'P2021',
        clientVersion: 'test',
    });

const report = (warnings: string[] = []): SupportMonitorRunReport => ({
    domain: LINE,
    dryRun: false,
    dialogs: [
        {
            sessionId: 71,
            chatId: 769,
            lineId: 9,
            clientName: 'Савчук Вадим',
            clientPortal: 'april-garant.bitrix24.ru',
            operatorName: null,
            waitedMinutes: 3,
            pendingText: 'Здравствуйте',
            url: '',
            crmUrl: null,
        },
    ],
    signals: [],
    warnings,
});

function setup() {
    const repository = {
        findKnown: jest.fn().mockResolvedValue([
            {
                id: 'gone',
                lineDomain: LINE,
                sessionId: 70,
                chatId: 700,
                lineId: 9,
                clientPortal: null,
                clientName: null,
                operatorName: null,
                maxWaitedMinutes: 0,
                firstSeenAt: NOW,
                lastSeenAt: NOW,
                answeredAt: null,
                closedAt: null,
            },
        ]),
        apply: jest.fn().mockResolvedValue(undefined),
        findByClientPortal: jest.fn().mockResolvedValue([]),
        trackedSince: jest.fn().mockResolvedValue(NOW),
    };
    const service = new SupportDialogHistoryService(
        repository as unknown as SupportDialogHistoryRepository,
    );
    return { service, repository };
}

describe('SupportDialogHistoryService.record', () => {
    it('создаёт увиденные и закрывает пропавшие', async () => {
        const { service, repository } = setup();
        await service.record(report(), NOW);
        expect(repository.findKnown).toHaveBeenCalledWith(LINE, [71]);
        const plan = (repository.apply.mock.calls[0] as unknown[])[1];
        expect(plan).toEqual(
            expect.objectContaining({
                closeIds: ['gone'],
                creates: [expect.objectContaining({ sessionId: 71 })],
            }),
        );
    });

    it('с замечаниями читателя никого не закрывает', async () => {
        const { service, repository } = setup();
        await service.record(
            report(['переписка диалога 70 не прочитана']),
            NOW,
        );
        const plan = (repository.apply.mock.calls[0] as unknown[])[1];
        expect(plan).toEqual(expect.objectContaining({ closeIds: [] }));
    });

    it('таблицы нет — такт не падает', async () => {
        const { service, repository } = setup();
        repository.findKnown.mockRejectedValueOnce(tableMissing());
        await expect(service.record(report(), NOW)).resolves.toBeUndefined();
        expect(repository.apply).not.toHaveBeenCalled();
    });
});

describe('SupportDialogHistoryService.stats', () => {
    it('считает по нормализованному порталу за период', async () => {
        const { service, repository } = setup();
        const stats = await service.stats(
            'https://April-Garant.bitrix24.ru/',
            30,
            NOW,
        );
        expect(repository.findByClientPortal).toHaveBeenCalledWith(
            'april-garant.bitrix24.ru',
            new Date('2026-10-09T12:00:00Z'),
        );
        expect(stats).toEqual(
            expect.objectContaining({
                available: true,
                reason: null,
                clientPortal: 'april-garant.bitrix24.ru',
                days: 30,
                trackedSince: NOW,
                total: 0,
            }),
        );
    });

    it('таблицы нет — available=false с причиной', async () => {
        const { service, repository } = setup();
        repository.findByClientPortal.mockRejectedValueOnce(tableMissing());
        const stats = await service.stats('april-garant.bitrix24.ru', 7, NOW);
        expect(stats).toEqual(
            expect.objectContaining({
                available: false,
                reason: SUPPORT_HISTORY_TABLE_MISSING,
                total: 0,
                recent: [],
            }),
        );
    });

    it('другая ошибка БД — пробрасывается', async () => {
        const { service, repository } = setup();
        repository.findByClientPortal.mockRejectedValueOnce(
            new Error('ECONNREFUSED'),
        );
        await expect(service.stats('a.bitrix24.ru', 7, NOW)).rejects.toThrow(
            'ECONNREFUSED',
        );
    });
});
