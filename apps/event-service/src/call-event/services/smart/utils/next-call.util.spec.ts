import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { calcDateCallNext } from './next-call.util';

const task = (title: string, deadline: string): IBXTask =>
    ({ title, deadline }) as unknown as IBXTask;

describe('calcDateCallNext', () => {
    it('возвращает пустую строку без задач', () => {
        expect(calcDateCallNext([])).toBe('');
    });

    it('возвращает ближайший дедлайн среди задач', () => {
        const tasks = [
            task('Звонок: A', '2026-06-20T10:00:00+03:00'),
            task('Звонок: B', '2026-06-12T09:00:00+03:00'),
        ];
        expect(calcDateCallNext(tasks)).toBe('12.06.2026 09:00');
    });

    it('фильтрует по подстроке заголовка', () => {
        const tasks = [
            task('Обучение: A', '2026-06-20T10:00:00+03:00'),
            task('Звонок: B', '2026-06-12T09:00:00+03:00'),
        ];
        expect(calcDateCallNext(tasks, { title: 'обучение' })).toBe(
            '20.06.2026 10:00',
        );
    });
});
