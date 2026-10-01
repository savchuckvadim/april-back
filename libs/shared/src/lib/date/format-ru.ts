import dayjs, { type ConfigType, type Dayjs } from 'dayjs';
import 'dayjs/locale/ru';

/**
 * Дата по-русски через dayjs — с ЯВНОЙ локалью ru на каждый вызов.
 *
 * Не полагаться на глобальный `dayjs.locale('ru')`: его ставил побочный
 * эффект конструктора чужого сервиса, и после распила монорепы счёт в
 * конструкторе печатал месяц по-английски («1 October 2026 г.»). Здесь
 * локаль подключена импортом и применяется к копии даты — результат не
 * зависит от того, какие модули загрузились раньше.
 *
 * Часовой пояс сохраняется: `formatRu(dayjs(x).tz(tz), …)`.
 */
export const formatRu = (value: Dayjs | ConfigType, pattern: string): string =>
    (dayjs.isDayjs(value) ? value : dayjs(value)).locale('ru').format(pattern);
