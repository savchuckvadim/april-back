import { DuplicateClassifyOptions } from '../../lib/duplicate-classify';
import {
    DuplicateClientInput,
    DuplicateDeal,
    DuplicateLead,
} from '../../types/duplicate-report.types';

/** Фикстуры отчёта по дублям: сделки, лиды и разбор на фиксированный момент. */

export const DOMAIN = 'garant.bitrix24.ru';
export const DAY = 24 * 60 * 60 * 1000;
/** Понедельник 05.10.2026 09:00 по Москве. */
export const NOW = Date.UTC(2026, 9, 5, 6, 0, 0);

/** Работающие сотрудники: 11, 12, 13; 99 — уволен; 447 — владелец вебхука. */
export const CLASSIFY_OPTIONS: DuplicateClassifyOptions = {
    now: NOW,
    periodStart: NOW - 7 * DAY,
    periodEnd: NOW - 9 * 60 * 60 * 1000,
    activeUserIds: new Set([11, 12, 13]),
    systemUserIds: new Set([447]),
};

/**
 * Сделка отчёта. `openTasks` без `ownOpenTasks` — задачи самого
 * ответственного (так их чаще всего и пишут тесты); чужие задачи — явным
 * `ownOpenTasks: 0`.
 */
export const makeDeal = (
    id: number,
    patch: Partial<DuplicateDeal> = {},
): DuplicateDeal => ({
    id,
    title: `Клиент — сделка ${id}`,
    stageName: 'Холодные',
    stageOrder: 2,
    assignedById: 11,
    createdById: 11,
    companyId: 100,
    contactId: null,
    opportunity: 0,
    createdAt: NOW - 60 * DAY,
    modifiedAt: NOW - 60 * DAY,
    lastActivityAt: null,
    lastActivityById: null,
    sourceLeadId: null,
    joinedLeads: 0,
    inn: '',
    openTasks: 0,
    openTaskIds: [],
    lead: null,
    ...patch,
    ownOpenTasks: patch.ownOpenTasks ?? patch.openTasks ?? 0,
});

export const makeLead = (
    id: number,
    createdAt: number,
    patch: Partial<DuplicateLead> = {},
): DuplicateLead => ({
    id,
    title: `Лид ${id}`,
    createdAt,
    sourceName: 'Заявка с веб-сайта',
    isRequest: true,
    ...patch,
});

export const makeClientInput = (
    deals: DuplicateDeal[],
    patch: Partial<DuplicateClientInput> = {},
): DuplicateClientInput => ({
    ref: { kind: 'company', id: deals[0]?.companyId ?? 100 },
    title: 'ООО «Ромашка»',
    inn: '3666000000',
    deals,
    ...patch,
});

/** Имена сотрудников для текстов. */
export const NAMES: ReadonlyMap<number, string> = new Map([
    [11, 'Иван Петров'],
    [12, 'Анна Сидорова'],
    [13, 'Олег Орлов'],
    [99, 'Пётр Уволенный'],
]);
