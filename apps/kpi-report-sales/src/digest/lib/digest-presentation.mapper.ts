/**
 * Сделка «ОП Презентации» → презентация дня; выигранная сделка «ОП Основная»
 * → продажа дня. Чистые функции: даты нормализуются к
 * `YYYY-MM-DD HH:mm:ss` в локальном времени ответа Битрикса, статус дня
 * считается от выбранной даты.
 */
import type { IsoDate } from '../../shared/lib/month-segments.util';
import {
    KPI_DIGEST_HISTORY_LINES,
    KPI_DIGEST_SPONTANEOUS_TITLE_MARK,
    KpiDigestPresDayStatus,
} from '../constants/digest.const';
import type {
    KpiDigestPresentationDto,
    KpiDigestSaleDto,
} from '../dto/digest-presentations.dto';
import type { DigestDealFields } from './digest-deal-fields.util';
import { stageSuffix } from './digest-deal-fields.util';
import {
    firstScalar,
    normalizeBitrixDateTime,
    scalarsOf,
} from './digest-record.mapper';
import type { ListElementRow } from './digest-page-loader';

const num = (raw: unknown): number => {
    const value = Number(firstScalar(raw));
    return Number.isFinite(value) ? value : 0;
};

const idOrNull = (raw: unknown): number | null => {
    const value = num(raw);
    return value > 0 ? value : null;
};

const date = (raw: unknown): string | null =>
    normalizeBitrixDateTime(firstScalar(raw));

/** `D_123`, `123`, `['D_123']` → 123; иначе null. */
export const linkedDealId = (raw: unknown): number | null => {
    for (const value of scalarsOf(raw)) {
        const match = /^(?:D_)?(\d+)$/i.exec(value.trim());
        if (match) return Number(match[1]);
    }
    return null;
};

const inDay = (value: string | null, day: IsoDate): boolean =>
    !!value && value.slice(0, 10) === day;

const hourOf = (value: string | null): number | null => {
    if (!value) return null;
    const hour = Number(value.slice(11, 13));
    return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
};

/** «YYYY-MM-DD HH:mm:ss» + N часов (без часовых поясов, по компонентам). */
export const shiftDateTime = (
    value: string | null,
    hours: number,
): string | null => {
    if (!value || !hours) return value;
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
        value,
    );
    if (!match) return value;
    const [, y, mo, d, h, mi, se] = match.map(Number);
    const moment = new Date(Date.UTC(y, mo - 1, d, h + hours, mi, se));
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${moment.getUTCFullYear()}-${pad(moment.getUTCMonth() + 1)}-${pad(moment.getUTCDate())} ` +
        `${pad(moment.getUTCHours())}:${pad(moment.getUTCMinutes())}:${pad(moment.getUTCSeconds())}`
    );
};

const wallMs = (value: string): number => {
    const [d, t] = value.split(' ');
    return Date.parse(`${d}T${t}Z`);
};

/** Минимум пар для вывода о сдвиге и доля, которую должен набрать один сдвиг. */
const SKEW_MIN_SAMPLES = 3;
const SKEW_MIN_SHARE = 0.6;
const SKEW_MAX_HOURS = 12;

/**
 * Сдвиг UF-дат сделки относительно системных, в часах.
 *
 * event-sales пишет UF-даты (назначена, проведена) стенным временем
 * портала, а Битрикс отдаёт их в поясе пользователя вебхука — как и
 * системные MOVED_TIME/DATE_CREATE, записи списка KPI и звонки. На
 * немосковском портале UF «уезжают» на разницу поясов. У проведённой
 * презентации дата проведения и смена стадии — один момент отчёта:
 * их разница по большинству сделок и есть сдвиг. Нет уверенного
 * большинства — 0.
 */
export function detectUfSkewHours(
    rows: readonly ListElementRow[],
    fields: DigestDealFields,
): number {
    const doneKey = fields.uf.lastPresDoneDate;
    if (!doneKey) return 0;
    const counts = new Map<number, number>();
    let samples = 0;
    for (const row of rows) {
        if (stageSuffix(String(row.STAGE_ID ?? '')) !== 'WON') continue;
        const done = date(row[doneKey]);
        const moved = date(row.MOVED_TIME);
        if (!done || !moved) continue;
        const diff = Math.round((wallMs(done) - wallMs(moved)) / 3_600_000);
        if (!Number.isFinite(diff) || Math.abs(diff) > SKEW_MAX_HOURS) continue;
        samples += 1;
        counts.set(diff, (counts.get(diff) ?? 0) + 1);
    }
    if (samples < SKEW_MIN_SAMPLES) return 0;
    const [best, count] = [...counts.entries()].sort(
        (a, b) => b[1] - a[1],
    )[0] ?? [0, 0];
    return count / samples >= SKEW_MIN_SHARE ? best : 0;
}

/** Сырые признаки сделки презентации, нужные для статуса дня. */
export interface PresentationDealFacts {
    stageCode: string | null;
    planDate: string | null;
    planCreatedAt: string | null;
    doneDate: string | null;
    createdAt: string | null;
    movedAt: string | null;
    title: string;
}

/** Статус презентации в дне (без учёта записей списка — их добавляет сборка). */
export function presentationDayStatus(
    facts: PresentationDealFacts,
    day: IsoDate,
): KpiDigestPresDayStatus {
    const { stageCode } = facts;
    if (inDay(facts.doneDate, day)) return 'held';
    const movedToday = inDay(facts.movedAt, day);
    const plannedForDay = inDay(facts.planDate, day);
    if (stageCode === 'spres_noresult' && (movedToday || plannedForDay))
        return 'notHeld';
    if (stageCode === 'spres_fail' && movedToday) return 'refused';
    if (stageCode === 'spres_pending' && movedToday) return 'postponed';
    if (
        plannedForDay &&
        (stageCode === 'spres_plan' ||
            stageCode === 'spres_new' ||
            stageCode === 'spres_pending')
    ) {
        return 'pending';
    }
    const plannedToday =
        inDay(facts.planCreatedAt, day) || inDay(facts.createdAt, day);
    if (plannedToday && !!facts.planDate && facts.planDate.slice(0, 10) > day) {
        return 'plannedNext';
    }
    // Спонтанная, созданная сразу проведённой, без даты проведения.
    if (stageCode === 'spres_success' && inDay(facts.createdAt, day))
        return 'held';
    return 'other';
}

/** Час статуса для почасового графика. */
export function presentationHour(
    status: KpiDigestPresDayStatus,
    facts: PresentationDealFacts,
): number | null {
    switch (status) {
        case 'held':
            return hourOf(facts.doneDate) ?? hourOf(facts.createdAt);
        case 'pending':
            return hourOf(facts.planDate);
        case 'plannedNext':
            return hourOf(facts.planCreatedAt) ?? hourOf(facts.createdAt);
        default:
            return hourOf(facts.movedAt);
    }
}

export function isSpontaneous(facts: PresentationDealFacts): boolean {
    if (facts.title.toLowerCase().includes(KPI_DIGEST_SPONTANEOUS_TITLE_MARK))
        return true;
    return (
        facts.stageCode === 'spres_success' &&
        !facts.planCreatedAt &&
        !facts.planDate
    );
}

/** Строки истории сделки (multiple-поле), не больше лимита. */
export const historyLines = (raw: unknown): string[] =>
    scalarsOf(raw).slice(0, KPI_DIGEST_HISTORY_LINES);

/** Сделка «ОП Презентации» → презентация дня (без имён сущностей и комментариев). */
export function mapPresentationDeal(
    row: ListElementRow,
    fields: DigestDealFields,
    day: IsoDate,
    /** Сдвиг UF-дат к поясу системных (detectUfSkewHours, со знаком минус). */
    ufShiftHours = 0,
): KpiDigestPresentationDto {
    const { uf } = fields;
    const ufDate = (key: string): string | null =>
        key ? shiftDateTime(date(row[key]), ufShiftHours) : null;
    const stage = fields.presStages.get(
        stageSuffix(String(row.STAGE_ID ?? '')),
    );
    const facts: PresentationDealFacts = {
        stageCode: stage?.code ?? null,
        planDate: ufDate(uf.nextPresPlanDate),
        planCreatedAt: ufDate(uf.lastPresPlanDate),
        doneDate: ufDate(uf.lastPresDoneDate),
        createdAt: date(row.DATE_CREATE),
        movedAt: date(row.MOVED_TIME),
        title: typeof row.TITLE === 'string' ? row.TITLE : '',
    };
    const plannedAtStart =
        inDay(facts.planDate, day) &&
        !!(facts.planCreatedAt ?? facts.createdAt) &&
        (facts.planCreatedAt ?? facts.createdAt)!.slice(0, 10) < day;
    const dayStatus = presentationDayStatus(facts, day);
    const complectName = uf.complectName
        ? firstScalar(row[uf.complectName])
        : null;
    const opportunity = num(row.OPPORTUNITY);
    const companyId = idOrNull(row.COMPANY_ID);
    const contactId = idOrNull(row.CONTACT_ID);
    const leadId = idOrNull(row.LEAD_ID);
    const baseDealId = uf.toBaseSales
        ? linkedDealId(row[uf.toBaseSales])
        : null;

    return {
        dealId: num(row.ID),
        title: facts.title,
        stageCode: facts.stageCode,
        stageName: stage?.name ?? null,
        dayStatus,
        assignedId: num(row.ASSIGNED_BY_ID),
        planAuthorId: uf.xoCreated ? idOrNull(row[uf.xoCreated]) : null,
        planDate: facts.planDate,
        planCreatedAt: facts.planCreatedAt,
        doneDate: facts.doneDate,
        createdAt: facts.createdAt,
        movedAt: facts.movedAt,
        hour: presentationHour(dayStatus, facts),
        plannedAtStart,
        spontaneous: isSpontaneous(facts),
        company: companyId ? { id: companyId, title: '' } : null,
        contact: contactId ? { id: contactId, title: '' } : null,
        lead: leadId ? { id: leadId, title: '' } : null,
        baseDeal: baseDealId ? { id: baseDealId, title: '' } : null,
        complectName: complectName || null,
        complectSource: complectName || opportunity > 0 ? 'presentation' : null,
        sum: opportunity,
        productNames: [],
        planComment: null,
        reportComment: null,
        noresultReason: null,
        history: uf.opMhistory ? historyLines(row[uf.opMhistory]) : [],
    };
}

/** Выигранная сделка «ОП Основная» → продажа дня (без имён и презентаций). */
export function mapSaleDeal(
    row: ListElementRow,
    fields: DigestDealFields,
): KpiDigestSaleDto {
    const { uf } = fields;
    const companyId = idOrNull(row.COMPANY_ID);
    const contactId = idOrNull(row.CONTACT_ID);
    const leadId = idOrNull(row.LEAD_ID);
    const complectName = uf.complectName
        ? firstScalar(row[uf.complectName])
        : null;
    return {
        dealId: num(row.ID),
        title: typeof row.TITLE === 'string' ? row.TITLE : '',
        assignedId: num(row.ASSIGNED_BY_ID),
        closeDate: date(row.CLOSEDATE),
        opportunity: num(row.OPPORTUNITY),
        company: companyId ? { id: companyId, title: '' } : null,
        contact: contactId ? { id: contactId, title: '' } : null,
        lead: leadId ? { id: leadId, title: '' } : null,
        complectName: complectName || null,
        productNames: [],
        history: uf.opMhistory ? historyLines(row[uf.opMhistory]) : [],
        presentations: [],
    };
}
