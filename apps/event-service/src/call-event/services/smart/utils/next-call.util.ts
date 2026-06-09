import dayjs from 'dayjs';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { CRM_DATETIME_SHORT_FORMAT, SERVICE_TZ } from './date.util';

/**
 * Аналог legacy `calc_date_call_next`: среди задач компании находит ближайший
 * (наименьший) дедлайн. Если задан `title` — учитывает только задачи, в чьём
 * заголовке встречается подстрока (без учёта регистра). Возвращает дату в
 * формате `DD.MM.YYYY HH:mm` или пустую строку, если задач нет.
 */
export function calcDateCallNext(
    tasks: IBXTask[],
    options: { title?: string } = {},
    tz: string = SERVICE_TZ,
): string {
    if (!tasks.length) {
        return '';
    }
    const title = options.title?.toLowerCase();
    const deadlines = tasks
        .filter(task =>
            title ? (task.title ?? '').toLowerCase().includes(title) : true,
        )
        .map(task => task.deadline)
        .filter(d => Boolean(d))
        .map(d => dayjs(String(d)))
        .filter(d => d.isValid());

    if (!deadlines.length) {
        return '';
    }
    const earliest = deadlines.reduce((min, d) => (d.isBefore(min) ? d : min));
    return earliest.tz(tz).format(CRM_DATETIME_SHORT_FORMAT);
}
