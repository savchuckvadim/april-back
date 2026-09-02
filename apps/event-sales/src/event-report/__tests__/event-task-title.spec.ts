import {
    clipTaskTitle,
    clipText,
    TASK_TITLE_MAX_LENGTH,
} from '../services/task/event-task-title';

/**
 * Заголовок задачи в `varchar(250)`: длиннее — `tasks.task.add` отказывает,
 * и задача не создаётся при «проведённом» отчёте (todo0209 №2).
 */
describe('clipTaskTitle', () => {
    const parts = {
        typeName: '🔥 Решение',
        eventName: 'Обсудить КП',
        contactName: 'Иванов',
    };

    it('короткий заголовок — формат легаси, двойные пробелы между частями', () => {
        expect(clipTaskTitle(parts)).toBe('🔥 Решение  Обсудить КП  Иванов');
    });

    it('без контакта хвоста нет', () => {
        expect(clipTaskTitle({ ...parts, contactName: '' })).toBe(
            '🔥 Решение  Обсудить КП',
        );
    });

    it('длинное имя плана режется с многоточием, тип и контакт целы', () => {
        const title = clipTaskTitle({ ...parts, eventName: 'п'.repeat(250) });

        expect(title.length).toBe(TASK_TITLE_MAX_LENGTH);
        expect(title.startsWith('🔥 Решение  п')).toBe(true);
        expect(title.endsWith('…  Иванов')).toBe(true);
    });

    it('имени плана не хватает даже под многоточие — режется весь заголовок', () => {
        const title = clipTaskTitle(
            { typeName: 'т'.repeat(200), eventName: 'x', contactName: 'к'.repeat(100) },
            250,
        );

        expect(title.length).toBe(250);
    });
});

describe('clipText', () => {
    it('короткий текст не трогает, длинный режет по лимиту', () => {
        expect(clipText('abc', 5)).toBe('abc');
        expect(clipText('abcdefgh', 5)).toBe('abcde');
    });
});
