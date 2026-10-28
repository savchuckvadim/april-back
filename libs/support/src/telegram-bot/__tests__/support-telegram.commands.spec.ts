import {
    analysis,
    draft,
} from '../../assistant/__tests__/support-assistant-fixtures';
import {
    buildSupportCallback,
    parseSupportCallback,
    parseSupportCommand,
} from '../domain/support-telegram.commands';
import { buildDraftKeyboard } from '../domain/support-telegram.keyboard';
import { telegramUserName } from '../domain/support-telegram.update';

describe('parseSupportCommand', () => {
    it('помощь: латинские команды и русские слова, суффикс @бот', () => {
        for (const text of ['/start', '/help@AprilBot', 'Помощь', 'справка?']) {
            expect(parseSupportCommand(text)).toEqual({ kind: 'help' });
        }
    });

    it('диалоги: «что в поддержке», /dialogs, одно слово', () => {
        for (const text of [
            'Что в поддержке?',
            '/dialogs',
            'диалоги',
            'очередь',
        ]) {
            expect(parseSupportCommand(text)).toEqual({ kind: 'dialogs' });
        }
        expect(parseSupportCommand('диалоги с клиентами')).toBeNull();
    });

    it('разбор: запрос без служебных слов и кавычек, упоминание бота в начале', () => {
        expect(parseSupportCommand('разбери Соломатову')).toEqual({
            kind: 'analyze',
            query: 'Соломатову',
        });
        expect(
            parseSupportCommand('@AprilBot разбери диалог с «Иванов»'),
        ).toEqual({
            kind: 'analyze',
            query: 'Иванов',
        });
        expect(parseSupportCommand('/analyze@AprilBot 769')).toEqual({
            kind: 'analyze',
            query: '769',
        });
        expect(parseSupportCommand('Разбор')).toEqual({
            kind: 'analyze',
            query: '',
        });
    });

    it('обычная переписка в группе — не команда', () => {
        expect(parseSupportCommand('Юля, посмотри диалог 769')).toBeNull();
        expect(parseSupportCommand('')).toBeNull();
        expect(parseSupportCommand(undefined)).toBeNull();
    });
});

describe('callback_data кнопок', () => {
    it('сборка и разбор — туда и обратно, лимит Telegram 64 байта', () => {
        const data = buildSupportCallback('send', 'a1b2c3d4e5f6');
        expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
        expect(parseSupportCallback(data)).toEqual({
            action: 'send',
            draftId: 'a1b2c3d4e5f6',
        });
    });

    it('чужие, неполные и лишние данные — null', () => {
        expect(parseSupportCallback('other:send:1')).toBeNull();
        expect(parseSupportCallback('sa:fly:1')).toBeNull();
        expect(parseSupportCallback('sa:send')).toBeNull();
        expect(parseSupportCallback('sa:send:1:2')).toBeNull();
        expect(parseSupportCallback(undefined)).toBeNull();
    });

    it('кнопки: «Задача разработчику» только когда разбор его требует', () => {
        const plain = buildDraftKeyboard(draft());
        expect(plain.map(row => row.map(button => button.text))).toEqual([
            ['✅ Отправить клиенту'],
            ['🗑 Убрать'],
        ]);
        const withTask = buildDraftKeyboard(
            draft({ analysis: analysis({ needsDeveloper: true }) }),
        );
        expect(withTask[1]?.map(button => button.callback_data)).toEqual([
            'sa:task:abc123',
            'sa:discard:abc123',
        ]);
    });
});

describe('telegramUserName', () => {
    it('имя и фамилия с ником, только ник, только id', () => {
        expect(
            telegramUserName({
                id: 1,
                first_name: 'Вадим',
                last_name: 'Савчук',
                username: 'vadim',
            }),
        ).toBe('Вадим Савчук (@vadim)');
        expect(telegramUserName({ id: 1, username: 'vadim' })).toBe('@vadim');
        expect(telegramUserName({ id: 1 })).toBe('Telegram #1');
        expect(telegramUserName(undefined)).toContain('неизвестный');
    });
});
