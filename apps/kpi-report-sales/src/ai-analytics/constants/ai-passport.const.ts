/**
 * Константы паспорта менеджера и снимка планов (план Фазы 2, поток 14a
 * «p2-manager-passport»; план 4.6 «since без ручного ввода» и 4.9 «цель из
 * плана руководителя»).
 *
 * Файл отдельный от `constants/ai-analytics.const.ts` намеренно (правило
 * владения общими файлами §1.6 п. 3): в общий файл пишет только поток
 * настроек. Магических строк полей Bitrix, кодов шагов и причин пропуска
 * в коде потока нет (ai/rules/pbx-typing.md).
 */
import { AI_ANALYTICS_CACHE_PREFIX } from './ai-analytics.const';
import { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага конвейера, кладущего паспорта менеджеров в шину. */
export const AI_PASSPORT_STEP_CODE = 'passport' as const;

/**
 * Паспорт нужен всем ритмам, кроме догона истории: недельные и месячные
 * снапшоты берут из него полосу стажа и статус, а backfill считает по уже
 * записанным снапшотам и в портал не ходит.
 */
export const AI_PASSPORT_STEP_RHYTHMS = [
    'nightly',
    'weekly',
    'monthly',
] as const satisfies readonly AiPipelineRhythm[];

/**
 * Поля `user.get` каскада: дата трудоустройства (может отсутствовать на
 * портале — каскад обязан деградировать), дата регистрации, признак
 * активности и дата последней активности (для `leftAt`).
 */
export const AI_PASSPORT_USER_FIELDS = [
    'ID',
    'ACTIVE',
    'DATE_REGISTER',
    'UF_EMPLOYMENT_DATE',
    'LAST_ACTIVITY_DATE',
] as const;

/** Ключ фильтра `user.get` по списку id (строгое равенство). */
export const AI_PASSPORT_USER_ID_FILTER = '=ID' as const;

/** Порция `user.get`: метод отдаёт страницами по 50 записей. */
export const AI_PASSPORT_USER_CHUNK = 50;

/** Секция кэша паспортов и TTL (UF-поля сотрудников меняются редко). */
export const AI_PASSPORT_CACHE_SECTION = 'passport' as const;
export const AI_PASSPORT_TTL_SECONDS = 60 * 60;

/** Испытательный срок: до него статус «на испытательном сроке». */
export const AI_PASSPORT_PROBATION_MONTHS = 3;

/** Ключ кэша паспортов: домен и нормализованный список менеджеров. */
export function buildPassportKey(domain: string, usersKey: string): string {
    return `${AI_ANALYTICS_CACHE_PREFIX}:${domain}:${AI_PASSPORT_CACHE_SECTION}:${usersKey}`;
}

/** Причины пропуска шага паспорта (штатная деградация §5.4). */
export const AI_PASSPORT_SKIP_REASONS = {
    noRoster: 'passport-no-roster',
    noUsers: 'passport-users-not-read',
} as const;

/**
 * Санити цели (план 4.9): план считается пожеланием, если за окно фактов
 * его выполняют меньше трети сотрудников. Месяц засчитывается менеджеру,
 * когда факт продаж не ниже плана; менеджер считается выполняющим, если
 * закрыл план не меньше чем в половине своих месяцев окна.
 */
export const AI_PLANS_WISH = {
    /** Доля выполняющих, ниже которой план — пожелание. */
    share: 0.3,
    /** Месяцев фактов в окне. */
    factMonths: 3,
    /** Меньше стольких менеджеров с планом и фактом — доля не считается. */
    minManagers: 3,
    /** Доля своих месяцев, начиная с которой менеджер «выполняет план». */
    monthsShare: 0.5,
} as const;

/** Причины пропуска шага снимка планов. */
export const AI_PLANS_SKIP_REASONS = {
    /** Снимок месяца уже есть — повторный тик его не перезаписывает. */
    alreadyCaptured: 'plans-already-captured',
    /** Месяц закрыт (заморозка 3-го числа) — снимать нечего. */
    monthClosed: 'plans-month-closed',
    noRoster: 'plans-no-roster',
    /** Bitrix не отдал UF-поля планов — снимок пустым не пишем. */
    notRead: 'plans-not-read',
} as const;

/** Причины, по которым доля выполняющих план не посчитана. */
export const AI_PLANS_WISH_REASONS = {
    noFacts: 'no-facts',
    noTargets: 'no-targets',
} as const;
