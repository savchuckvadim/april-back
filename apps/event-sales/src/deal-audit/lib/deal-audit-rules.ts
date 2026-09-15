import {
    DEAL_AUDIT_FLAG,
    DEAL_AUDIT_FLAG_LABEL,
    DEAL_AUDIT_PRE_CLOSE_STAGES,
    DEAL_AUDIT_STATUS,
    DEAL_AUDIT_STATUS_PRIORITY,
    DealAuditFlagCode,
    DealAuditStatusCode,
} from '../constants/deal-audit.const';
import {
    DealAuditSnapshot,
    DealAuditThresholds,
    DealAuditVerdict,
} from '../types/deal-audit.types';

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MS_IN_HOUR = 60 * 60 * 1000;

/**
 * Полных суток между моментами; null, если момента нет.
 *
 * Именно ПОЛНЫХ: «13 часов без работы» — это ноль дней, а не «почти день».
 * Округление вверх завышало бы каждый признак ровно на сутки и делало бы
 * порог из админки на единицу строже, чем его задал владелец.
 */
export const daysBetween = (from: number | null, to: number): number | null =>
    from === null ? null : Math.max(0, Math.floor((to - from) / MS_IN_DAY));

/**
 * Признаки «забытости» одной сделки — ЧИСТАЯ функция.
 *
 * Ни Битрикса, ни времени «изнутри»: `now` приходит параметром, слепок уже
 * разобран. Вся содержательная логика модуля живёт здесь и покрывается
 * тестами без сети и без портала.
 */
export const evaluateDeal = (
    snapshot: DealAuditSnapshot,
    thresholds: DealAuditThresholds,
    now: number,
): DealAuditVerdict => {
    const flags: DealAuditFlagCode[] = [];

    const idleDays = daysBetween(snapshot.lastActivityAt, now);
    const stageDays = daysBetween(snapshot.stageMovedAt, now);
    const overdueDays = maxOverdueDays(snapshot, thresholds, now);

    if (snapshot.openTasks.length === 0) {
        flags.push(DEAL_AUDIT_FLAG.noTask);
    } else {
        if (overdueDays !== null) flags.push(DEAL_AUDIT_FLAG.taskOverdue);
        /*
         * Задача без дедлайна — признак ТОЛЬКО когда других задач нет:
         * пока хоть одна задача имеет срок, работа спланирована, и
         * бессрочная рядом с ней ничего не ломает.
         */
        if (snapshot.openTasks.every(task => task.deadlineAt === null)) {
            flags.push(DEAL_AUDIT_FLAG.taskNoDeadline);
        }
    }

    if (snapshot.nextCallAt === null) {
        flags.push(DEAL_AUDIT_FLAG.nextDateEmpty);
    } else if (snapshot.nextCallAt < now) {
        flags.push(DEAL_AUDIT_FLAG.nextDatePast);
    }

    if (idleDays !== null && idleDays >= thresholds.idleDays) {
        flags.push(DEAL_AUDIT_FLAG.idle);
    }
    if (stageDays !== null && stageDays >= thresholds.stageStuckDays) {
        flags.push(DEAL_AUDIT_FLAG.stageStuck);
    }
    if (isForgotClose(snapshot, thresholds, idleDays, stageDays)) {
        flags.push(DEAL_AUDIT_FLAG.forgotClose);
    }
    if (!snapshot.assignedById) {
        flags.push(DEAL_AUDIT_FLAG.noResponsible);
    }

    return {
        dealId: snapshot.dealId,
        title: snapshot.title,
        assignedById: snapshot.assignedById,
        status: pickStatus(flags),
        flags,
        idleDays,
        overdueDays: overdueDays ?? 0,
        stageDays,
        openTasks: snapshot.openTasks.length,
        comment: buildAuditComment(snapshot, flags, idleDays, stageDays),
    };
};

/**
 * Дней просрочки самой «старой» открытой задачи; null — просроченных нет.
 *
 * Порог в ЧАСАХ, а не в днях: задача «на сегодня 18:00» в 18:05 формально
 * просрочена, но ругаться на это нельзя — потому владелец и задаёт запас.
 */
const maxOverdueDays = (
    snapshot: DealAuditSnapshot,
    thresholds: DealAuditThresholds,
    now: number,
): number | null => {
    const threshold = now - thresholds.overdueHours * MS_IN_HOUR;
    let oldest: number | null = null;
    for (const task of snapshot.openTasks) {
        if (task.deadlineAt === null || task.deadlineAt > threshold) continue;
        if (oldest === null || task.deadlineAt < oldest)
            oldest = task.deadlineAt;
    }
    return oldest === null ? null : (daysBetween(oldest, now) ?? 0);
};

/**
 * «Забыли закрыть»: сделка на стадиях, где решение клиента уже должно было
 * состояться, и по ней давно тихо.
 *
 * Молчание меряется по активности, а при её отсутствии — по времени в
 * стадии: на порталах без единого дела активность карточки бывает пустой,
 * и признак терялся бы именно на самых заброшенных сделках.
 */
const isForgotClose = (
    snapshot: DealAuditSnapshot,
    thresholds: DealAuditThresholds,
    idleDays: number | null,
    stageDays: number | null,
): boolean => {
    if (!snapshot.stageCode) return false;
    const isPreClose = (
        DEAL_AUDIT_PRE_CLOSE_STAGES as readonly string[]
    ).includes(snapshot.stageCode);
    if (!isPreClose) return false;
    const silentFor = idleDays ?? stageDays;
    return silentFor !== null && silentFor >= thresholds.forgotCloseDays;
};

/** Один «худший» признак — для канбан-фильтра и условия робота. */
export const pickStatus = (
    flags: readonly DealAuditFlagCode[],
): DealAuditStatusCode => {
    for (const { flag, status } of DEAL_AUDIT_STATUS_PRIORITY) {
        if (flags.includes(flag)) return status;
    }
    return DEAL_AUDIT_STATUS.ok;
};

/**
 * Расшифровка для карточки и дайджеста: «просрочена задача · давно нет
 * работы 23 дн. · в стадии «В оплате» 41 дн.».
 *
 * Пишется по-русски и с числами — читает её менеджер, а не машина;
 * машине предназначены enum-поля рядом.
 */
export const buildAuditComment = (
    snapshot: DealAuditSnapshot,
    flags: readonly DealAuditFlagCode[],
    idleDays: number | null,
    stageDays: number | null,
): string => {
    if (!flags.length) return 'Норма: работа по сделке ведётся';
    const parts = flags.map(flag => DEAL_AUDIT_FLAG_LABEL[flag]);
    if (idleDays !== null) parts.push(`без работы ${idleDays} дн.`);
    if (stageDays !== null && snapshot.stageName) {
        parts.push(`в стадии «${snapshot.stageName}» ${stageDays} дн.`);
    }
    const text = parts.join(' · ');
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Забыта ли сделка (статус ≠ «Норма») — один смысл на весь модуль. */
export const isForgotten = (verdict: DealAuditVerdict): boolean =>
    verdict.status !== DEAL_AUDIT_STATUS.ok;
