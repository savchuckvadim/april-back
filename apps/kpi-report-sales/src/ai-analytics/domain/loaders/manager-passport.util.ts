/**
 * Чистая часть паспорта менеджера (план Фазы 2, поток 14a; план 4.6):
 * разбор ответа `user.get`, каскад даты начала работы, статус на дату
 * расчёта и сборка паспорта. Без DI, Bitrix и `new Date()` — время и
 * границы полос приходят параметрами.
 *
 * Отделено от `manager-passport.loader.ts` (загрузчик и кэш) по лимиту
 * 300 строк и правилу «одна ответственность на файл».
 */
import type {
    AiManagerStatus,
    AiPassportSinceSource,
    ManagerPassport,
} from '@lib/sales-ai-analytics';
import {
    levelByTenureBand,
    tenureBandOf,
    tenureMonthsBetween,
    type TenureGates,
} from '@lib/sales-ai-analytics/model/tenure-bands';
import type {
    AiAbsence,
    AiManagerLevelSetting,
} from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { AI_PASSPORT_PROBATION_MONTHS } from '../../constants/ai-passport.const';

/** Факты пользователя Bitrix, из которых собирается паспорт. */
export interface ManagerUserFacts {
    managerId: string;
    /** Сотрудник не уволен (`ACTIVE`). */
    active: boolean;
    /** UF_EMPLOYMENT_DATE 'YYYY-MM-DD'; null — поля нет на портале. */
    employmentDate: string | null;
    /** DATE_REGISTER 'YYYY-MM-DD'; null — не прочитана. */
    registerDate: string | null;
    /** LAST_ACTIVITY_DATE 'YYYY-MM-DD'; null — не прочитана. */
    lastActivityAt: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const RU_DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})/;

/** Значение даты Bitrix → 'YYYY-MM-DD'; пусто и мусор → null. */
export function toPassportDate(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw === '') return null;
    if (ISO_DATE_RE.test(raw)) return raw.slice(0, 10);
    const ru = RU_DATE_RE.exec(raw);

    return ru ? `${ru[3]}-${ru[2]}-${ru[1]}` : null;
}

/** `ACTIVE` Bitrix приходит и булевым, и строкой 'Y'/'N'. */
export function isActiveValue(raw: unknown): boolean {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    if (typeof raw !== 'string') return true;

    return raw !== 'N' && raw !== 'false' && raw !== '0';
}

/** Запись `user.get` → факты паспорта; запись без id отбрасывается. */
export function toUserFacts(raw: Record<string, unknown>): ManagerUserFacts[] {
    const id = raw.ID;
    const managerId =
        typeof id === 'string' || typeof id === 'number'
            ? String(id).trim()
            : '';
    if (!managerId || !Number.isFinite(Number(managerId))) return [];

    return [
        {
            managerId,
            active: isActiveValue(raw.ACTIVE),
            employmentDate: toPassportDate(raw.UF_EMPLOYMENT_DATE),
            registerDate: toPassportDate(raw.DATE_REGISTER),
            lastActivityAt: toPassportDate(raw.LAST_ACTIVITY_DATE),
        },
    ];
}

/** Дата начала работы и её источник: каскад из трёх шагов. */
export function resolveSince(
    facts: ManagerUserFacts | undefined,
    firstEventAt: string | null,
): { since: string | null; sinceSource: AiPassportSinceSource | null } {
    if (facts?.employmentDate) {
        return { since: facts.employmentDate, sinceSource: 'employment' };
    }
    if (facts?.registerDate) {
        return { since: facts.registerDate, sinceSource: 'register' };
    }
    if (firstEventAt) return { since: firstEventAt, sinceSource: 'proxy' };

    return { since: null, sinceSource: null };
}

/** Дата внутри отрезка отсутствия (границы включительно). */
function isAbsentOn(absences: readonly AiAbsence[], day: string): boolean {
    return absences.some(absence => absence.from <= day && day <= absence.to);
}

/**
 * Статус на дату расчёта: уволен важнее отсутствия, отсутствие — важнее
 * испытательного срока. Дата ухода — последнее событие сотрудника; её
 * может не быть (`null`), и это не ошибка.
 */
export function resolveStatus(
    facts: ManagerUserFacts | undefined,
    input: {
        day: string;
        tenureMonths: number | null;
        absences: readonly AiAbsence[];
    },
): { status: AiManagerStatus; leftAt: string | null } {
    if (facts && !facts.active) {
        return { status: 'left', leftAt: facts.lastActivityAt };
    }
    if (isAbsentOn(input.absences, input.day)) {
        return { status: 'absent', leftAt: null };
    }
    const probation =
        input.tenureMonths !== null &&
        input.tenureMonths < AI_PASSPORT_PROBATION_MONTHS;

    return { status: probation ? 'probation' : 'active', leftAt: null };
}

/** Вход сборки одного паспорта (всё уже разложено по менеджеру). */
export interface BuildPassportInput {
    managerId: string;
    facts?: ManagerUserFacts;
    /** Дата первого события телефонии/отчётности 'YYYY-MM-DD'. */
    firstEventAt: string | null;
    /** Запись уровня, назначенного руководителем; нет — подсказка по стажу. */
    level?: AiManagerLevelSetting;
    absences: readonly AiAbsence[];
    /** Дата расчёта стажа 'YYYY-MM-DD'. */
    until: string;
    gates: TenureGates;
    /** Отдел продаж по раскладке ростера; нет — null (не «сменился»). */
    departmentId?: number | null;
}

/** Паспорт менеджера из фактов портала, настроек и прокси-события. */
export function buildPassport(input: BuildPassportInput): ManagerPassport {
    const { since, sinceSource } = resolveSince(
        input.facts,
        input.firstEventAt,
    );
    const tenureMonths = tenureMonthsBetween(since, input.until);
    const tenureBand = tenureBandOf(tenureMonths, input.gates);
    const { status, leftAt } = resolveStatus(input.facts, {
        day: input.until,
        tenureMonths,
        absences: input.absences,
    });

    return {
        managerId: input.managerId,
        since,
        sinceSource,
        status,
        leftAt,
        level: input.level?.level ?? levelByTenureBand(tenureBand),
        levelSource: input.level ? 'manual' : 'default',
        tenureMonths,
        tenureBand,
        departmentId: input.departmentId ?? null,
    };
}
