import { ETimeZone } from './timezone';
import { parsePortalInput } from './parse-portal-input';

const TASK_SERVER_TIMEZONE: ETimeZone = ETimeZone.EUROPE_MOSCOW;
const TASK_DEADLINE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/**
 * Готовит значение DEADLINE для `tasks.task.add` / `tasks.task.update`.
 *
 * Bitrix API задач хранит DEADLINE в server-time (Europe/Moscow на наших порталах).
 * Если пользователь портала, например, в Asia/Novosibirsk назначает дедлайн "10:00",
 * сюда придёт строка локального времени (10:00 Novosibirsk), и в Bitrix мы должны
 * записать тот же момент времени, переведённый в Moscow ("06:00 Moscow"). Без этого
 * задача в B24 покажет другое время, чем имел в виду менеджер.
 *
 * Legacy-эталон: BitrixCallingColdService::getCreateTaskBatchCommands (Carbon-блок
 * с setTimezone('Europe/Moscow')).
 */
export function toTaskDeadline(raw: string, portalTz: ETimeZone): string {
    return parsePortalInput(raw, portalTz)
        .tz(TASK_SERVER_TIMEZONE)
        .format(TASK_DEADLINE_FORMAT);
}
