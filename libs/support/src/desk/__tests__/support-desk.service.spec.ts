import { BadRequestException } from '@nestjs/common';
import { LogQueryService } from '@lib/logger/query';
import { SupportDeskService } from '../application/support-desk.service';
import { SupportMonitorSettingsService } from '../../monitor/application/support-monitor-settings.service';
import { SupportMonitorOptions } from '../../monitor/application/support-monitor-options';
import { SupportTelegramNotifier } from '../../monitor/infrastructure/support-telegram.notifier';
import {
    buildSupportTaskDescription,
    formatReplyJournal,
    supportTaskUrl,
} from '../domain/support-desk.text';
import { liveTail } from '../../monitor/__tests__/support-bitrix-fixtures';

const options: SupportMonitorOptions = {
    enabled: true,
    dryRun: false,
    lineId: 9,
    notifyDomain: 'april-garant.bitrix24.ru',
    notifyUserIds: [1],
    operatorMap: new Map<number, number>(),
    thresholds: { remindMinutes: 10, escalateMinutes: 30 },
    pollMinutes: 3,
    telegramEnabled: true,
};

function setup(enabledDomains: string[] = ['april-dev.bitrix24.ru']) {
    const lineBitrix = {
        message: { add: jest.fn().mockResolvedValue({ result: 27101 }) },
        imOpenlinesOperatorSession: { join: jest.fn() },
        imV2ChatMessage: {
            tail: jest.fn().mockResolvedValue({ result: liveTail() }),
        },
    };
    const notifyBitrix = {
        task: {
            add: jest
                .fn()
                .mockResolvedValue({ result: { task: { id: '120345' } } }),
        },
    };
    const pbx = {
        initWebhook: jest.fn((domain: string) =>
            Promise.resolve({
                bitrix:
                    domain === 'april-garant.bitrix24.ru'
                        ? notifyBitrix
                        : lineBitrix,
            }),
        ),
    };
    const settings = {
        listEnabledDomains: jest.fn().mockResolvedValue(enabledDomains),
        resolveOptions: jest.fn().mockResolvedValue(options),
    };
    const telegram = { send: jest.fn().mockResolvedValue(true) };
    const logs = {
        summary: jest.fn().mockResolvedValue({ conclusions: ['тихо'] }),
        rows: jest.fn().mockResolvedValue([]),
    };
    const service = new SupportDeskService(
        pbx as never,
        settings as unknown as SupportMonitorSettingsService,
        telegram as unknown as SupportTelegramNotifier,
        logs as unknown as LogQueryService,
    );
    return { service, pbx, lineBitrix, notifyBitrix, telegram, settings, logs };
}

describe('SupportDeskService', () => {
    it('портал линии по умолчанию — первый с включённым мониторингом', async () => {
        const { service, pbx } = setup();
        await service.readDialog(769, 30);
        expect(pbx.initWebhook).toHaveBeenCalledWith('april-dev.bitrix24.ru');
    });

    it('явный портал важнее настроек и нормализуется', async () => {
        const { service, pbx, settings } = setup();
        await service.readDialog(769, 30, 'https://GSR.bitrix24.ru/');
        expect(pbx.initWebhook).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(settings.listEnabledDomains).not.toHaveBeenCalled();
    });

    it('портал не указан и мониторинг нигде не включён — понятная ошибка 400', async () => {
        const { service } = setup([]);
        await expect(service.readDialog(769, 30)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('ответ клиенту: сообщение ушло, копия с подтвердившим — в Telegram-чат', async () => {
        const { service, lineBitrix, telegram } = setup();
        const result = await service.reply(769, 'Смотрим.', 'Вадим Савчук');

        expect(lineBitrix.message.add).toHaveBeenCalledWith({
            DIALOG_ID: 'chat769',
            MESSAGE: 'Смотрим.',
        });
        expect(result).toEqual({
            domain: 'april-dev.bitrix24.ru',
            chatId: 769,
            messageId: 27101,
            joined: false,
        });
        const journal = telegram.send.mock.calls[0] as unknown[];
        expect(journal[0]).toContain('Подтвердил: Вадим Савчук');
        expect(journal[0]).toContain('Клиент: Савчук Вадим');
    });

    it('задача на исправление — на портале оповещений, со ссылкой на диалог', async () => {
        const { service, notifyBitrix } = setup();
        const result = await service.createTask({
            title: ' Не уходит отчёт ',
            description: 'Скриншот в диалоге',
            responsibleId: 1,
            chatId: 769,
        });
        expect(notifyBitrix.task.add).toHaveBeenCalledWith({
            TITLE: 'Не уходит отчёт',
            DESCRIPTION:
                'Скриншот в диалоге\n\nДиалог с клиентом: https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769',
            RESPONSIBLE_ID: 1,
        });
        expect(result).toEqual({
            domain: 'april-garant.bitrix24.ru',
            taskId: 120345,
            url: 'https://april-garant.bitrix24.ru/company/personal/user/0/tasks/task/view/120345/',
        });
    });

    it('ошибки портала клиента: сводка и последние ошибки по нормализованному домену', async () => {
        const { service, logs } = setup();
        const result = await service.clientErrors(
            'https://AlfaCentr.bitrix24.ru/',
            48,
        );
        expect(logs.summary).toHaveBeenCalledWith({
            hours: 48,
            domain: 'alfacentr.bitrix24.ru',
        });
        expect(logs.rows).toHaveBeenCalledWith(
            { hours: 48, domain: 'alfacentr.bitrix24.ru', level: 'error' },
            20,
        );
        expect(result.domain).toBe('alfacentr.bitrix24.ru');
        await expect(service.clientErrors('  ', 24)).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('задача без номера от Битрикса — ошибка', async () => {
        const { service, notifyBitrix } = setup();
        notifyBitrix.task.add.mockResolvedValue({ result: {} });
        await expect(
            service.createTask({
                title: 'x',
                description: 'y',
                responsibleId: 1,
            }),
        ).rejects.toThrow('не вернул номер');
    });
});

describe('тексты стойки', () => {
    it('журнал ответа экранирует HTML', () => {
        expect(
            formatReplyJournal({
                lineDomain: 'april-dev.bitrix24.ru',
                chatId: 769,
                text: '<b>x</b>',
                confirmedBy: 'Вадим',
                clientName: null,
            }),
        ).toContain('«&lt;b&gt;x&lt;/b&gt;»');
    });

    it('описание задачи без чата — только текст', () => {
        expect(
            buildSupportTaskDescription({
                description: ' текст ',
                lineDomain: 'd',
            }),
        ).toBe('текст');
        expect(supportTaskUrl('d', 5)).toBe(
            'https://d/company/personal/user/0/tasks/task/view/5/',
        );
    });
});
