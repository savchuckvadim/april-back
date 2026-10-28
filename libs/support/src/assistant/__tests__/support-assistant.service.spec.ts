import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import { SupportDeskService } from '../../desk/application/support-desk.service';
import { SupportMonitorSettingsService } from '../../monitor/application/support-monitor-settings.service';
import { SupportAssistantService } from '../application/support-assistant.service';
import { SUPPORT_ANALYSIS_SCHEMA_NAME } from '../domain/support-assistant.schema';
import { SupportDraftStore } from '../infrastructure/support-draft.store';
import {
    analysis,
    chatView,
    draft,
    LINE,
    MemoryDraftStore,
    report,
} from './support-assistant-fixtures';

function setup() {
    const desk = {
        readDialog: jest.fn().mockResolvedValue(chatView()),
        clientErrors: jest.fn().mockResolvedValue({
            domain: 'alfacentr.bitrix24.ru',
            summary: {
                hours: 24,
                from: '',
                to: '',
                apps: [],
                topErrors: [],
                domains: [],
                conclusions: [],
            },
            recent: [],
        }),
        listDialogs: jest.fn().mockResolvedValue({
            domain: LINE,
            dialogs: [
                report(),
                report({ chatId: 780, clientName: 'Иванов Пётр' }),
            ],
            warnings: [],
        }),
        reply: jest.fn().mockResolvedValue({
            domain: LINE,
            chatId: 769,
            messageId: 27101,
            joined: false,
        }),
        createTask: jest.fn().mockResolvedValue({
            domain: 'april-garant.bitrix24.ru',
            taskId: 120345,
            url: 'https://april-garant.bitrix24.ru/company/personal/user/0/tasks/task/view/120345/',
        }),
    };
    const llm = {
        structuredCompletionWithUsage: jest.fn().mockResolvedValue({
            result: analysis(),
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            model: 'BitrixGPT',
            provider: 'vibecode',
        }),
    };
    const drafts = new MemoryDraftStore();
    const settings = {
        resolveOptions: jest.fn().mockResolvedValue({ notifyUserIds: [1, 77] }),
    };
    const service = new SupportAssistantService(
        desk as unknown as SupportDeskService,
        llm as unknown as StructuredLlmGateway,
        drafts as unknown as SupportDraftStore,
        settings as unknown as SupportMonitorSettingsService,
    );
    return { service, desk, llm, drafts, settings };
}

describe('SupportAssistantService.analyze', () => {
    it('переписка и ошибки портала клиента → шлюз LLM по домену линии → черновик в памяти', async () => {
        const { service, desk, llm, drafts } = setup();
        const result = await service.analyze(769);
        expect(desk.readDialog).toHaveBeenCalledWith(769, 30, undefined);
        expect(desk.clientErrors).toHaveBeenCalledWith(
            'alfacentr.bitrix24.ru',
            24,
        );
        const [system, content, schemaName, , domain] = llm
            .structuredCompletionWithUsage.mock.calls[0] as string[];
        expect(system).toContain('ИИ-помощник технической поддержки');
        expect(content).toContain('Не открывается отчёт о звонке');
        expect(schemaName).toBe(SUPPORT_ANALYSIS_SCHEMA_NAME);
        expect(domain).toBe(LINE);
        expect(result).toEqual(
            expect.objectContaining({
                lineDomain: LINE,
                chatId: 769,
                clientName: 'Соломатова Анна',
                clientPortal: 'alfacentr.bitrix24.ru',
                replyText: 'Отчёт не потерялся, он отправится сам.',
                provider: 'vibecode',
                model: 'BitrixGPT',
            }),
        );
        expect(result.id).toMatch(/^[0-9a-f]{12}$/);
        expect(drafts.drafts.get(result.id)).toEqual(result);
    });

    it('журнал ошибок недоступен — разбираем без него; портала нет — не ходим в журнал', async () => {
        const { service, desk, llm } = setup();
        desk.clientErrors.mockRejectedValueOnce(
            new Error('ClickHouse недоступен'),
        );
        await service.analyze(769);
        expect(
            (llm.structuredCompletionWithUsage.mock.calls[0] as string[])[1],
        ).toContain('сейчас недоступен');

        desk.readDialog.mockResolvedValueOnce(chatView({ client: null }));
        await service.analyze(769, 'April-Dev.bitrix24.ru');
        expect(desk.clientErrors).toHaveBeenCalledTimes(1);
        expect(desk.readDialog).toHaveBeenLastCalledWith(
            769,
            30,
            'April-Dev.bitrix24.ru',
        );
    });

    it('модель вернула мусор — ошибка, черновик не сохраняется', async () => {
        const { service, llm, drafts } = setup();
        llm.structuredCompletionWithUsage.mockResolvedValueOnce({
            result: { summary: 'x' },
            usage: {},
            model: null,
            provider: 'openai-compatible',
        });
        await expect(service.analyze(769)).rejects.toThrow('черновик ответа');
        expect(drafts.save).not.toHaveBeenCalled();
    });
});

describe('SupportAssistantService — черновик', () => {
    it('правка меняет только текст ответа; пустая — ошибка', async () => {
        const { service, drafts } = setup();
        drafts.drafts.set('abc123', draft());
        const revised = await service.revise('abc123', '  Новый текст ');
        expect(revised.replyText).toBe('Новый текст');
        expect(revised.analysis.draftReply).toBe(
            'Отчёт не потерялся, он отправится сам.',
        );
        await expect(service.revise('abc123', '   ')).rejects.toThrow(
            BadRequestException,
        );
    });

    it('отправка — текст черновика, кто подтвердил и домен линии; черновик удаляется', async () => {
        const { service, desk, drafts } = setup();
        drafts.drafts.set('abc123', draft({ replyText: 'Правленый' }));
        const { result } = await service.send(
            'abc123',
            'Вадим (кнопка в Telegram)',
        );
        expect(desk.reply).toHaveBeenCalledWith(
            769,
            'Правленый',
            'Вадим (кнопка в Telegram)',
            LINE,
        );
        expect(result.messageId).toBe(27101);
        expect(drafts.drafts.has('abc123')).toBe(false);
        await expect(service.send('abc123', 'x')).rejects.toThrow(
            NotFoundException,
        );
    });

    it('задача разработчику — первому получателю колокольчика, название из разбора', async () => {
        const { service, desk, drafts, settings } = setup();
        drafts.drafts.set(
            'abc123',
            draft({
                analysis: analysis({
                    needsDeveloper: true,
                    taskTitle: 'Починить очередь',
                }),
            }),
        );
        const task = await service.createTask('abc123');
        expect(task.taskId).toBe(120345);
        expect(desk.createTask).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Починить очередь',
                responsibleId: 1,
                chatId: 769,
                description: expect.stringContaining(
                    'Клиент: Соломатова Анна (alfacentr.bitrix24.ru)',
                ) as string,
            }),
            LINE,
        );

        settings.resolveOptions.mockResolvedValueOnce({ notifyUserIds: [] });
        await expect(service.createTask('abc123')).rejects.toThrow(
            BadRequestException,
        );
    });

    it('поиск диалога отдаёт домен линии, находку и все открытые', async () => {
        const { service } = setup();
        const lookup = await service.findDialog('Иванова');
        expect(lookup.lineDomain).toBe(LINE);
        expect(lookup.dialog?.chatId).toBe(780);
        expect(lookup.dialogs).toHaveLength(2);
    });
});
