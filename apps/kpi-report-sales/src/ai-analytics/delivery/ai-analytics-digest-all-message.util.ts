/**
 * Сводный утренний дайджест по всем менеджерам портала (решение владельца
 * 07.09.2026, план §14.5 п. 8): чистая группировка ростера по отделам и
 * текст уведомления (BB-код Bitrix). Без Nest и Bitrix — покрывается
 * тестами напрямую; транспорт — AiAnalyticsDeliveryService.sendDigestAll.
 */
import { DigestItem } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_DIGEST_ALL_CALLS_PER_MANAGER } from '../constants/ai-analytics.const';
import { ManagerOrg } from '../domain/loaders/manager-org.loader';
import {
    formatCallTime,
    formatPortalDay,
    sectionTitle,
    truncateQuote,
} from './ai-analytics-message.util';

export interface DigestAllManagerEntry {
    managerId: string;
    /** «Фамилия Имя» либо «#id». */
    name: string;
    /** До AI_ANALYTICS_DIGEST_ALL_CALLS_PER_MANAGER звонков; пусто — звонков не было. */
    items: readonly DigestItem[];
}

export interface DigestAllDepartmentEntry {
    departmentId: number | null;
    /** Название отдела, «Отдел #id» либо «Без отдела». */
    title: string;
    managers: DigestAllManagerEntry[];
}

export interface DigestAllGroupInput {
    /** Весь ростер ОП портала (bitrix-id). */
    roster: readonly number[];
    /** Раскладка менеджеров по отделам (ManagerOrgLoader). */
    org: ReadonlyMap<number, ManagerOrg>;
    /** managerId → звонки вчерашнего рабочего дня (MorningDigestUseCase). */
    byManager: ReadonlyMap<string, readonly DigestItem[]>;
    /** managerId → «Фамилия Имя»; нет в карте → «#id». */
    names: ReadonlyMap<string, string>;
    /** Лимит звонков на менеджера (по умолчанию 3). */
    limit?: number;
}

export interface DigestAllMessageInput {
    /** День, за который собран разбор (YYYY-MM-DD, TZ портала). */
    day: string;
    timeZone: string;
    departments: readonly DigestAllDepartmentEntry[];
    /** transcriptionId → ссылка на карточку разбора (null — нет). */
    links: ReadonlyMap<string, string | null>;
}

export const DIGEST_ALL_MESSAGE_TITLE = 'Сводный разбор звонков за вчера';
export const DIGEST_ALL_NO_CALLS = 'Звонков не было';
export const DIGEST_ALL_SUMMARY_TITLE = 'Итог, кому что:';
const NO_DEPARTMENT_TITLE = 'Без отдела';

const departmentTitle = (org: ManagerOrg | undefined): string => {
    if (!org || org.departmentId === null) return NO_DEPARTMENT_TITLE;
    return org.departmentName ?? `Отдел #${org.departmentId}`;
};

const compareByTitle = (
    a: { title: string; departmentId: number | null },
    b: { title: string; departmentId: number | null },
): number => {
    // «Без отдела» — в конец, остальные — по названию.
    if (a.departmentId === null) return b.departmentId === null ? 0 : 1;
    if (b.departmentId === null) return -1;
    return a.title.localeCompare(b.title, 'ru');
};

/**
 * Ростер ∪ менеджеры со звонками → отделы (по названию, «Без отдела» —
 * последним), внутри — менеджеры по имени, звонков не больше лимита.
 * Менеджер со звонками вне ростера (ушёл из отдела) не теряется —
 * попадает в «Без отдела».
 */
export function groupDigestAll(
    input: DigestAllGroupInput,
): DigestAllDepartmentEntry[] {
    const limit = input.limit ?? AI_ANALYTICS_DIGEST_ALL_CALLS_PER_MANAGER;
    const managerIds = new Set<string>([
        ...input.roster.map(String),
        ...input.byManager.keys(),
    ]);
    const departments = new Map<number | null, DigestAllDepartmentEntry>();
    for (const managerId of managerIds) {
        const org = input.org.get(Number(managerId));
        const departmentId = org?.departmentId ?? null;
        const entry = departments.get(departmentId) ?? {
            departmentId,
            title: departmentTitle(org),
            managers: [],
        };
        entry.managers.push({
            managerId,
            name: input.names.get(managerId) ?? `#${managerId}`,
            items: (input.byManager.get(managerId) ?? []).slice(0, limit),
        });
        departments.set(departmentId, entry);
    }
    return [...departments.values()]
        .map(entry => ({
            ...entry,
            managers: entry.managers.sort((a, b) =>
                a.name.localeCompare(b.name, 'ru'),
            ),
        }))
        .sort(compareByTitle);
}

/** Одна лучшая формулировка звонка — первая фраза alternatives. */
const bestPhrase = (item: DigestItem): string | null =>
    item.alternatives[0] ? truncateQuote(item.alternatives[0]) : null;

const nonNull = (line: string | null): line is string => line !== null;

function managerLines(
    manager: DigestAllManagerEntry,
    input: DigestAllMessageInput,
): string[] {
    return [
        manager.name,
        ...manager.items.flatMap((item, index) => {
            const phrase = bestPhrase(item);
            const link = input.links.get(item.transcriptionId) ?? null;
            return [
                `  ${index + 1}. ${formatCallTime(item.callStartedAt, input.timeZone)} · ${sectionTitle(item.section)}` +
                    (phrase ? ` — «${phrase}»` : ''),
                link ? `     Разбор: ${link}` : null,
            ].filter(nonNull);
        }),
    ];
}

function departmentLines(
    department: DigestAllDepartmentEntry,
    input: DigestAllMessageInput,
): string[] {
    const withCalls = department.managers.filter(m => m.items.length > 0);
    const silent = department.managers.filter(m => m.items.length === 0);
    return [
        '',
        `[B]${department.title}[/B]`,
        ...withCalls.flatMap(manager => managerLines(manager, input)),
        ...(silent.length
            ? [`${DIGEST_ALL_NO_CALLS}: ${silent.map(m => m.name).join(', ')}`]
            : []),
    ];
}

/** Итог «кому что»: менеджер → разделы его звонков без повторов. */
export function summaryLines(
    departments: readonly DigestAllDepartmentEntry[],
): string[] {
    const lines = departments
        .flatMap(department => department.managers)
        .filter(manager => manager.items.length > 0)
        .map(manager => {
            const sections = [
                ...new Set(
                    manager.items.map(item => sectionTitle(item.section)),
                ),
            ];
            return `— ${manager.name}: ${sections.join(', ')}`;
        });
    return lines.length ? [DIGEST_ALL_SUMMARY_TITLE, ...lines] : [];
}

/**
 * Текст сводного дайджеста: заголовок с датой, отделы (менеджер → до 3
 * звонков «время · раздел — «лучшая фраза»» + ссылка; «Звонков не было:
 * …» для остальных), в конце «Итог, кому что». Пустой день — одна строка
 * «Звонков не было».
 */
export function buildDigestAllMessage(input: DigestAllMessageInput): string {
    const head = `[B]${DIGEST_ALL_MESSAGE_TITLE}[/B] (${formatPortalDay(input.day)})`;
    const hasCalls = input.departments.some(department =>
        department.managers.some(manager => manager.items.length > 0),
    );
    if (!hasCalls) return [head, `${DIGEST_ALL_NO_CALLS}.`].join('\n');
    return [
        head,
        ...input.departments.flatMap(department =>
            departmentLines(department, input),
        ),
        '',
        ...summaryLines(input.departments),
    ].join('\n');
}
