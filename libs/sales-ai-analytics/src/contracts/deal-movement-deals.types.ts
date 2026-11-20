/**
 * Проблемные сделки последней ночи (витрина «Движение сделок», 20.11.2026):
 * тип ais `ai-analytics-deal-movement-deals`, ОДНА запись на портал (ключ
 * `latest`), каждую ночь перезаписывается на месте — список нужен только
 * за последнюю ночь, а дневные записи такого размера копились бы впустую.
 *
 * На каждого ответственного и каждый тревожный статус — не больше
 * `DEAL_MOVEMENT_DEALS_PER_GROUP` самых крупных по сумме сделок; сколько
 * их всего — в `groups`. Пишет event-sales, читает витрина отчёта KPI.
 */
import {
    DEAL_MOVEMENT_ALARM_STATUSES,
    DEAL_MOVEMENT_LIMIT_SOURCES,
    type DealMovementLimitSource,
} from '../model/deal-movement/deal-movement.types';

/** Ключ (activity_id) единственной записи портала. */
export const DEAL_MOVEMENT_DEALS_KEY = 'latest';

/** Форма записи — для будущих изменений полей. */
export const DEAL_MOVEMENT_DEALS_FORM = 1;

/** Не больше стольких сделок на ответственного и статус (по сумме). */
export const DEAL_MOVEMENT_DEALS_PER_GROUP = 30;

/** Тревожный статус — всё, кроме «Движется». */
export type DealMovementAlarmStatus =
    (typeof DEAL_MOVEMENT_ALARM_STATUSES)[number];

/** Проблемная сделка: всё, что показывает строка списка витрины. */
export interface DealMovementProblemDeal {
    dealId: string;
    /** Ответственный (Bitrix-id строкой); null — не назначен. */
    managerId: string | null;
    status: DealMovementAlarmStatus;
    title: string;
    /** Сумма сделки; null — не указана. */
    amount: number | null;
    /** Код ступени лестницы «ОП Основная»; null — стадия вне лестницы. */
    stageCode: string | null;
    /** Название стадии на портале; null — неизвестно. */
    stageTitle: string | null;
    daysInStage: number;
    /** Срок стадии, с которым сравнивали, дней. */
    stageLimitDays: number;
    /** Откуда срок: история портала или общий порог. */
    stageLimitSource: DealMovementLimitSource;
    /** Причины статуса словами, одной строкой. */
    reasons: string;
    /**
     * С какой ночи сделка в этом статусе, ISO 8601; null — в нём с первого
     * счёта (смены при нас не было).
     */
    since: string | null;
}

/** Ответственный × статус: сколько сделок всего и сколько в списке. */
export interface DealMovementProblemGroup {
    managerId: string | null;
    status: DealMovementAlarmStatus;
    total: number;
    shown: number;
}

export interface DealMovementDealsSnapshotPayload {
    form: number;
    /** День портала 'YYYY-MM-DD' ночного счёта. */
    day: string;
    generatedAt: string;
    calcVersion: string;
    /** Предел сделок на ответственного и статус. */
    perGroup: number;
    groups: DealMovementProblemGroup[];
    deals: DealMovementProblemDeal[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isAlarmStatus = (value: unknown): value is DealMovementAlarmStatus =>
    (DEAL_MOVEMENT_ALARM_STATUSES as readonly unknown[]).includes(value);

const isNullableString = (value: unknown): value is string | null =>
    value === null || typeof value === 'string';

/** Структурная проверка строки списка при чтении из ais. */
export function isDealMovementProblemDeal(
    value: unknown,
): value is DealMovementProblemDeal {
    return (
        isRecord(value) &&
        typeof value.dealId === 'string' &&
        isNullableString(value.managerId) &&
        isAlarmStatus(value.status) &&
        typeof value.title === 'string' &&
        (value.amount === null || typeof value.amount === 'number') &&
        isNullableString(value.stageCode) &&
        isNullableString(value.stageTitle) &&
        typeof value.daysInStage === 'number' &&
        typeof value.stageLimitDays === 'number' &&
        (DEAL_MOVEMENT_LIMIT_SOURCES as readonly unknown[]).includes(
            value.stageLimitSource,
        ) &&
        typeof value.reasons === 'string' &&
        isNullableString(value.since)
    );
}

const isProblemGroup = (value: unknown): value is DealMovementProblemGroup =>
    isRecord(value) &&
    isNullableString(value.managerId) &&
    isAlarmStatus(value.status) &&
    typeof value.total === 'number' &&
    typeof value.shown === 'number';

/**
 * Нагрузка записи ais → список проблемных сделок; не та форма — null.
 * Битые строки и группы отбрасываются, остальное читается.
 */
export function readDealMovementDealsSnapshot(
    value: unknown,
): DealMovementDealsSnapshotPayload | null {
    if (
        !isRecord(value) ||
        typeof value.day !== 'string' ||
        !Array.isArray(value.deals) ||
        !Array.isArray(value.groups)
    ) {
        return null;
    }
    return {
        form: typeof value.form === 'number' ? value.form : 1,
        day: value.day,
        generatedAt:
            typeof value.generatedAt === 'string' ? value.generatedAt : '',
        calcVersion:
            typeof value.calcVersion === 'string' ? value.calcVersion : '',
        perGroup:
            typeof value.perGroup === 'number'
                ? value.perGroup
                : DEAL_MOVEMENT_DEALS_PER_GROUP,
        groups: value.groups.filter(isProblemGroup),
        deals: value.deals.filter(isDealMovementProblemDeal),
    };
}
