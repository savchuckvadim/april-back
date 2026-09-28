import { Logger } from '@nestjs/common';
import { withPulseAlertLinks } from '../domain/presenter/pulse.presenter';
import { PulseUseCase } from '../domain/use-cases/pulse.use-case';
import type { AiAnalyticsFeedbackStore } from '../store/ai-analytics-feedback.store';
import {
    callsLoaderWith,
    liteRow,
    settingsLoaderWith,
} from './fixtures/lite-row.fixture';
import {
    smartLinksFailing,
    smartLinksWith,
} from './fixtures/smart-links.fixture';

/**
 * Ссылки сигналов пульса на карточки разборов: руководитель открывает
 * звонок из виджета. Ссылки — одним вызовом SmartLinkLoader на все сигналы;
 * fail-open: без элемента смарта или при ошибке загрузчика link = null.
 */

/** Суббота 05.09.2026 12:00 MSK → окно пн 31.08 — пт 04.09. */
const NOW = new Date('2026-09-05T09:00:00Z');

const smartLink = (itemId: number): string =>
    `https://d/crm/type/1036/details/${itemId}/`;

const emptyFeedback = (): AiAnalyticsFeedbackStore =>
    ({ listInPeriod: jest.fn().mockResolvedValue([]) }) as never;

/** Три сигнала окна (риск, urgent, риск) и спокойный звонок без сигнала. */
const rowsWithAlerts = () => [
    liteRow({
        transcriptionId: 'risk',
        riskFlags: ['promise'],
        callStartedAt: new Date('2026-09-01T07:00:00Z'),
    }),
    liteRow({
        transcriptionId: 'urgent',
        managerId: '20',
        coachingPriority: 'urgent',
        callStartedAt: new Date('2026-09-02T07:00:00Z'),
    }),
    liteRow({
        transcriptionId: 'fresh',
        riskFlags: ['conflict'],
        callStartedAt: new Date('2026-09-03T07:00:00Z'),
    }),
    liteRow({ transcriptionId: 'calm' }),
];

describe('PulseUseCase: ссылки сигналов на карточки разборов', () => {
    it('каждый сигнал получает link из загрузчика; без элемента смарта — null', async () => {
        const links = smartLinksWith({
            risk: smartLink(77),
            urgent: smartLink(78),
        });
        const useCase = new PulseUseCase(
            callsLoaderWith(rowsWithAlerts()).loader,
            settingsLoaderWith(),
            emptyFeedback(),
            links.loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(
            dto.alerts.map(alert => [alert.transcriptionId, alert.link]),
        ).toEqual([
            ['risk', smartLink(77)],
            ['urgent', smartLink(78)],
            ['fresh', null],
        ]);
    });

    it('загрузчик вызывается один раз со всеми transcriptionId сигналов (без спокойных звонков)', async () => {
        const links = smartLinksWith();
        const useCase = new PulseUseCase(
            callsLoaderWith(rowsWithAlerts()).loader,
            settingsLoaderWith(),
            emptyFeedback(),
            links.loader,
        );

        await useCase.execute('d', { now: NOW });

        expect(links.resolveLinks).toHaveBeenCalledTimes(1);
        expect(links.resolveLinks).toHaveBeenCalledWith('d', [
            'risk',
            'urgent',
            'fresh',
        ]);
    });

    it('без сигналов загрузчик не вызывается', async () => {
        const links = smartLinksWith();
        const useCase = new PulseUseCase(
            callsLoaderWith([liteRow({ transcriptionId: 'calm' })]).loader,
            settingsLoaderWith(),
            emptyFeedback(),
            links.loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.alerts).toEqual([]);
        expect(links.resolveLinks).not.toHaveBeenCalled();
    });

    it('fail-open: ошибка загрузчика → link = null у всех, пульс отдаётся, в лог — warn', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const useCase = new PulseUseCase(
            callsLoaderWith(rowsWithAlerts()).loader,
            settingsLoaderWith(),
            emptyFeedback(),
            smartLinksFailing('ais недоступен').loader,
        );

        const dto = await useCase.execute('d', { now: NOW });

        expect(dto.alerts.map(alert => alert.kind)).toEqual([
            'promise',
            'urgent',
            'conflict',
        ]);
        expect(dto.alerts.every(alert => alert.link === null)).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('ais недоступен');
        warn.mockRestore();
    });
});

describe('withPulseAlertLinks', () => {
    it('подставляет ссылку по transcriptionId, остальные поля не трогает; нет в карте → null', () => {
        const draft = {
            managerId: '10',
            transcriptionId: 'a',
            kind: 'promise' as const,
            quote: 'Дорого',
            callStartedAt: '2026-09-01T07:00:00.000Z',
            handled: false,
        };

        const alerts = withPulseAlertLinks(
            [draft, { ...draft, transcriptionId: 'b' }],
            new Map([['a', smartLink(5)]]),
        );

        expect(alerts).toEqual([
            { ...draft, link: smartLink(5) },
            { ...draft, transcriptionId: 'b', link: null },
        ]);
    });
});
