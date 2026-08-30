import {
    ADD_TASK_CMD,
    parseAddedTaskId,
} from '../services/task/event-report-task-flow.service';

/**
 * Разбор ответа `tasks.task.add` (`{ task: { id } }`) — источник id только что
 * созданной план-задачи. Битрикс отдаёт id то строкой, то числом, а при сбое
 * команды формы ответа может не быть вовсе: тогда нужен `null`, чтобы
 * вызывающий пропустил привязку, а не уронил отчёт.
 */
describe('parseAddedTaskId', () => {
    it('ключ batch-команды создания задачи не разъезжается с местом чтения', () => {
        expect(ADD_TASK_CMD).toBe('add_task');
    });

    it('приводит id-строку к числу', () => {
        expect(parseAddedTaskId({ task: { id: '123' } })).toBe(123);
    });

    it('принимает id числом как есть', () => {
        expect(parseAddedTaskId({ task: { id: 123 } })).toBe(123);
    });

    it('пустой объект — привязывать не к чему', () => {
        expect(parseAddedTaskId({})).toBeNull();
    });

    it('null (команды в ответе не было) даёт null', () => {
        expect(parseAddedTaskId(null)).toBeNull();
    });

    it('task без id даёт null', () => {
        expect(parseAddedTaskId({ task: {} })).toBeNull();
    });
});
