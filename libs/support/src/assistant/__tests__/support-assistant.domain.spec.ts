import { SUPPORT_REPLY_MAX_LENGTH } from '../../desk/domain/support-desk.text';
import {
    formatDialogsTelegram,
    formatDraftTelegram,
    formatLookupMiss,
} from '../domain/support-assistant.format';
import {
    buildAnalysisContent,
    SUPPORT_ASSISTANT_SYSTEM_PROMPT,
    SUPPORT_FREQUENT_PROBLEMS,
} from '../domain/support-assistant.prompt';
import { parseSupportAnalysis } from '../domain/support-assistant.schema';
import { findDialogByQuery } from '../domain/support-dialog.lookup';
import {
    analysis,
    chatView,
    draft,
    message,
    report,
} from './support-assistant-fixtures';

describe('parseSupportAnalysis', () => {
    it('полный ответ модели: поля обрезаются по краям, задача включает разработчика', () => {
        const parsed = parseSupportAnalysis({
            summary: '  Отчёт не открывается ',
            cause: 'Очередь',
            draftReply: ' Отчёт не потерялся. ',
            confidence: 'high',
            needsDeveloper: false,
            taskTitle: 'Проверить очередь отчётов',
            missingInfo: ['скриншот', '', 7, '  ссылка '],
        });
        expect(parsed).toEqual({
            summary: 'Отчёт не открывается',
            cause: 'Очередь',
            draftReply: 'Отчёт не потерялся.',
            confidence: 'high',
            needsDeveloper: true,
            taskTitle: 'Проверить очередь отчётов',
            missingInfo: ['скриншот', 'ссылка'],
        });
    });

    it('мусор запасного провайдера: неизвестная уверенность → low, лишние пункты режутся, длинный черновик — по лимиту', () => {
        const parsed = parseSupportAnalysis({
            summary: 'x',
            cause: 'y',
            draftReply: 'я'.repeat(SUPPORT_REPLY_MAX_LENGTH + 50),
            confidence: 'sure',
            needsDeveloper: 'yes',
            taskTitle: '  ',
            missingInfo: ['1', '2', '3', '4', '5', '6', '7'],
        });
        expect(parsed.confidence).toBe('low');
        expect(parsed.needsDeveloper).toBe(false);
        expect(parsed.taskTitle).toBeNull();
        expect(parsed.draftReply).toHaveLength(SUPPORT_REPLY_MAX_LENGTH);
        expect(parsed.missingInfo).toHaveLength(5);
    });

    it('без черновика или не объект — ошибка, до кнопки «Отправить» не дойдёт', () => {
        expect(() =>
            parseSupportAnalysis({ summary: 'x', cause: 'y', draftReply: '' }),
        ).toThrow('черновик ответа');
        expect(() => parseSupportAnalysis('text')).toThrow(
            'не является объектом',
        );
        expect(() =>
            parseSupportAnalysis({ draftReply: 'ok', cause: 'y' }),
        ).toThrow('суть');
    });
});

describe('findDialogByQuery', () => {
    const dialogs = [
        report(),
        report({
            sessionId: 72,
            chatId: 780,
            clientName: 'Иванов Пётр',
            clientPortal: 'gsr.bitrix24.ru',
        }),
        report({
            sessionId: 73,
            chatId: 790,
            clientName: 'Иванова Мария',
            clientPortal: null,
        }),
    ];

    it('номер чата, номер сессии', () => {
        expect(findDialogByQuery(dialogs, '780').dialog?.chatId).toBe(780);
        expect(findDialogByQuery(dialogs, '73').dialog?.chatId).toBe(790);
        expect(findDialogByQuery(dialogs, '999').dialog).toBeNull();
    });

    it('имя в любом падеже и регистре, портал по подстроке', () => {
        expect(findDialogByQuery(dialogs, 'Соломатову').dialog?.chatId).toBe(
            769,
        );
        expect(
            findDialogByQuery(dialogs, 'анна соломатова').dialog?.chatId,
        ).toBe(769);
        expect(findDialogByQuery(dialogs, 'gsr').dialog?.chatId).toBe(780);
        expect(findDialogByQuery(dialogs, 'Петра').dialog?.chatId).toBe(780);
    });

    it('несколько подходящих — кандидаты без выбора; никого — пусто', () => {
        const several = findDialogByQuery(dialogs, 'Иванов');
        expect(several.dialog).toBeNull();
        expect(several.candidates.map(d => d.chatId)).toEqual([780, 790]);
        expect(findDialogByQuery(dialogs, 'Сидоров')).toEqual({
            dialog: null,
            candidates: [],
        });
    });

    it('пустой запрос: единственный диалог — он, иначе ничего', () => {
        expect(findDialogByQuery([dialogs[0]], '').dialog?.chatId).toBe(769);
        expect(findDialogByQuery(dialogs, '  ').dialog).toBeNull();
    });
});

describe('форматы Telegram', () => {
    it('черновик: суть, причина с уверенностью, разработчик, цитата и экранирование', () => {
        const html = formatDraftTelegram(
            draft({
                analysis: analysis({
                    needsDeveloper: true,
                    taskTitle: 'Починить <очередь>',
                    missingInfo: ['скриншот'],
                }),
                replyText: 'Нажмите «Обновить» <и> подождите',
            }),
        );
        expect(html).toContain(
            '🧠 <b>Разбор: Соломатова Анна · alfacentr.bitrix24.ru</b>',
        );
        expect(html).toContain('(уверенность: средняя)');
        expect(html).toContain(
            '🛠 Нужен разработчик: «Починить &lt;очередь&gt;»',
        );
        expect(html).toContain('❓ Не хватает: скриншот');
        expect(html).toContain(
            '<blockquote>Нажмите «Обновить» &lt;и&gt; подождите</blockquote>',
        );
        expect(html).toContain('IM_DIALOG=chat769');
        expect(html).not.toContain('<b>Разбор: Соломатова Анна</b>\n🛠');
    });

    it('черновик длиннее лимита показа — режется, сообщение помещается в Telegram', () => {
        const html = formatDraftTelegram(
            draft({ replyText: 'ы'.repeat(4000) }),
        );
        expect(html.length).toBeLessThan(4096);
        expect(html).toContain('…</blockquote>');
    });

    it('список диалогов: ждущие дольше — выше, команда разбора у каждого; пусто — отдельная фраза', () => {
        const html = formatDialogsTelegram([
            report({
                chatId: 1,
                clientName: 'Быстрый',
                waitedMinutes: 0,
                pendingText: null,
                operatorName: 'Юлия',
            }),
            report({ chatId: 2, clientName: 'Долгий', waitedMinutes: 90 }),
        ]);
        expect(html.indexOf('Долгий')).toBeLessThan(html.indexOf('Быстрый'));
        expect(html).toContain('ждёт 1 ч 30 мин');
        expect(html).toContain('ответили, у Юлия');
        expect(html).toContain('/analyze 2');
        expect(formatDialogsTelegram([])).toContain('нет');
    });

    it('не нашли: с кандидатами — список для выбора, без — все открытые', () => {
        const dialogs = [
            report(),
            report({ chatId: 780, clientName: 'Иванов' }),
        ];
        expect(
            formatLookupMiss('Ива', { candidates: dialogs, dialogs }),
        ).toContain('несколько диалогов');
        const miss = formatLookupMiss('Сидоров', { candidates: [], dialogs });
        expect(miss).toContain('«Сидоров» не нашёл');
        expect(miss).toContain('Открытые диалоги: 2');
        expect(formatLookupMiss('', { candidates: [], dialogs })).toContain(
            'Укажите, кого разобрать',
        );
    });
});

describe('buildAnalysisContent', () => {
    it('переписка с ролями и московским временем, портал клиента, ошибки с выводами', () => {
        const content = buildAnalysisContent({
            view: chatView(),
            errors: {
                domain: 'alfacentr.bitrix24.ru',
                summary: {
                    hours: 24,
                    from: '',
                    to: '',
                    apps: [],
                    topErrors: [],
                    domains: [],
                    conclusions: ['всплеск ошибок в event-sales'],
                },
                recent: [
                    {
                        at: '2026-10-28T08:00:00.000Z',
                        app: 'event-sales',
                        env: 'prod',
                        level: 'error',
                        context: 'Queue',
                        message: 'Redis ECONNREFUSED',
                        meta: '',
                        trace: '',
                        domain: 'alfacentr.bitrix24.ru',
                    },
                ],
            },
        });
        expect(content).toContain(
            'Клиент: Соломатова Анна (портал alfacentr.bitrix24.ru).',
        );
        expect(content).toContain(
            '[28.10, 11:00] Клиент (Соломатова Анна): Добрый день! Не открывается отчёт о звонке',
        );
        expect(content).toContain('Система или бот линии: Диалог переведён');
        expect(content).toContain('- вывод: всплеск ошибок в event-sales');
        expect(content).toContain(
            '[28.10, 11:00] event-sales: Redis ECONNREFUSED',
        );
    });

    it('без портала журнал не смотрели; с порталом, но без журнала — недоступен; длинное сообщение режется', () => {
        const long = chatView({
            client: null,
            messages: [message(1, 'client', 'ж'.repeat(2000))],
        });
        const content = buildAnalysisContent({ view: long, errors: null });
        expect(content).toContain('Клиент: не определён.');
        expect(content).toContain('Портал клиента неизвестен');
        expect(content).toContain('ж'.repeat(1499) + '…');
        expect(content).not.toContain('ж'.repeat(1500));
        expect(
            buildAnalysisContent({ view: chatView(), errors: null }),
        ).toContain(
            'Журнал ошибок по порталу alfacentr.bitrix24.ru сейчас недоступен',
        );
    });

    it('системный промпт знает карточки частых проблем и запрещает писать клиенту самому', () => {
        for (const item of SUPPORT_FREQUENT_PROBLEMS) {
            expect(SUPPORT_ASSISTANT_SYSTEM_PROMPT).toContain(item);
        }
        expect(SUPPORT_ASSISTANT_SYSTEM_PROMPT).toContain(
            'ты сам ничего не отправляешь',
        );
    });
});
