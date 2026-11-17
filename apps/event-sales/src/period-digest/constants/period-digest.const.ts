import { ropKeys } from '@lib/rop-reports';
import { PERIOD_DIGEST_KEY_PREFIX } from '@lib/sales-ai-analytics';

/**
 * Итоги периода по менеджерам (этап 7.4) — постоянные отчёта для каркаса
 * `@lib/rop-reports`: имя в журнале, заголовок итога в Telegram, ключи
 * Redis и число попыток периода.
 */

/** Имя отчёта в журнале. */
export const PERIOD_DIGEST_CODE = 'period-digest';

/** Заголовок итога в Telegram. */
export const PERIOD_DIGEST_TITLE = 'Итоги периода по менеджерам';

/** Ключи Redis: общие с админкой (там читается итог прогона). */
export const PERIOD_DIGEST_KEYS = ropKeys(PERIOD_DIGEST_KEY_PREFIX);

/** Попыток на период; после последней период закрывается без отчёта. */
export const PERIOD_DIGEST_MAX_ATTEMPTS = 5;

/**
 * Доставка задачами и Excel — следующий этап (Э7). Пока её нет, любой
 * прогон — только подсчёт, что бы ни стояло в «только считать» и что бы
 * ни пришло из админки: задачи руководителям не ставятся.
 */
export const PERIOD_DIGEST_DELIVERY_READY = false;

/** Неделю выпуска — только в рабочие дни портала (праздничный понедельник — во вторник). */
export const PERIOD_DIGEST_WEEK_WORKDAYS_ONLY = true;
