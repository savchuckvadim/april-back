import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BxDepartmentStructureService } from 'libs/bx-department/services/bx-department-structure.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';

/** Минимум, который нужен от сотрудника структуры (структурная типизация). */
interface ICandidateUser {
    ID?: number | string;
    ACTIVE?: boolean;
}

/** app-cache приложение курсоров round-robin (домен добавляет сам слой). */
const ASSIGNEE_CACHE_APP = 'event-sales-hooks';
/** Курсор живёт месяц: потерялся — начнём с первого, это не ошибка. */
const ASSIGNEE_CURSOR_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Откуда взялся ответственный: `explicit` — пришёл в хук, `lead` — оставлен
 * как есть (ответственный лида, конвертация), `round-robin` — распределён по
 * курсору отдела (ХО-ветка).
 */
export const LEAD_TO_WORK_ASSIGNEE_SOURCES = [
    'explicit',
    'lead',
    'round-robin',
] as const;
export type LeadToWorkAssigneeSource =
    (typeof LEAD_TO_WORK_ASSIGNEE_SOURCES)[number];

/** Что известно о лиде на момент выбора ответственного. */
export interface ILeadToWorkAssigneeContext {
    /** Текущий ответственный лида (ASSIGNED_BY_ID); null — не задан. */
    leadResponsibleId?: number | null;
    /**
     * true — ответственного НЕ распределяем, а переносим с лида как есть
     * (конвертация). false — распределяем round-robin (ХО: заявка уходит
     * следующему по кругу менеджеру).
     */
    keepLeadResponsible?: boolean;
}

/** Итог резолва ответственного. */
export interface ILeadToWorkAssignee {
    /** null — кандидатов нет (отдел пуст/не найден). */
    responsible: number | null;
    source: LeadToWorkAssigneeSource;
    /** Ключ отдела, по которому крутится курсор (для логов/отладки). */
    departmentKey: string | null;
    warnings: string[];
}

/** Сохранённое состояние курсора одного отдела. */
interface IAssigneeCursor {
    /** Кому назначили в прошлый раз — следующий берётся после него. */
    lastUserId: number;
}

/**
 * Выбор ответственного, когда хук пришёл без responsible.
 *
 * Портал может держать НЕСКОЛЬКО отделов продаж (department multiple) —
 * робот передаёт «намёк» (параметр department), в каком именно ОП выбирать.
 * Формат намёка от робота пока не зафиксирован, поэтому:
 *  1) сырое значение логируется как есть (чтобы добрать формат с портала);
 *  2) из строки извлекаются цифры и матчится ID отдела ИЛИ группы;
 *  3) не смэтчилось — предупреждение и выбор среди ВСЕХ сотрудников ОП.
 *
 * Выбор не чистый random, а round-robin с курсором в app-cache
 * (`rr:{departmentKey}`, домен добавляет слой app-cache): нагрузка ложится
 * равномерно, а последовательные заявки не сыплются на одного человека.
 */
@Injectable()
export class LeadToWorkAssigneeService {
    private readonly logger = new Logger(LeadToWorkAssigneeService.name);

    constructor(
        private readonly structure: BxDepartmentStructureService,
        private readonly appCache: AppCacheService,
    ) {}

    async resolve(
        domain: string,
        item: ILeadToWorkItem,
        context: ILeadToWorkAssigneeContext = {},
    ): Promise<ILeadToWorkAssignee> {
        if (item.responsible) {
            return {
                responsible: item.responsible,
                source: 'explicit',
                departmentKey: null,
                warnings: [],
            };
        }

        /*
         * Конвертация: работа не перераспределяется — сделка и задачи
         * остаются у того, кто уже ведёт лид. Round-robin здесь был бы
         * вредом (заявка уехала бы случайному менеджеру), поэтому крутим
         * его только там, где распределение — суть операции (ХО).
         */
        const leadResponsibleId = Number(context.leadResponsibleId ?? 0);
        if (
            context.keepLeadResponsible &&
            Number.isFinite(leadResponsibleId) &&
            leadResponsibleId > 0
        ) {
            return {
                responsible: leadResponsibleId,
                source: 'lead',
                departmentKey: null,
                warnings: [],
            };
        }

        const warnings: string[] = [];
        if (context.keepLeadResponsible) {
            warnings.push(
                'У лида не задан ответственный — выбран по кругу из отдела продаж',
            );
        }
        // Формат намёка неизвестен — фиксируем сырое значение в логах.
        this.logger.log(
            `[assignee] lead=${item.leadId} responsible не передан; ` +
                `департамент-намёк: "${item.department ?? ''}"`,
        );

        const hint = this.parseDepartmentHint(item.department);
        const { candidates: allCandidates, departmentKey } =
            await this.collectCandidates(domain, hint, item, warnings);

        // Передача: прежний ответственный исключается — заявка не должна
        // вернуться ему же (если он не единственный в отделе).
        const excluded = item.excludeResponsible ?? null;
        const candidates =
            excluded && allCandidates.length > 1
                ? allCandidates.filter(id => id !== excluded)
                : allCandidates;

        if (candidates.length === 0) {
            warnings.push(
                'Не удалось выбрать ответственного: в отделе продаж нет активных сотрудников',
            );
            return {
                responsible: null,
                source: 'round-robin',
                departmentKey,
                warnings,
            };
        }

        const responsible = await this.nextByCursor(
            domain,
            departmentKey,
            candidates,
        );
        this.logger.log(
            `[assignee] lead=${item.leadId} round-robin(${departmentKey}) → ` +
                `user ${responsible} (кандидатов: ${candidates.length})`,
        );
        return { responsible, source: 'round-robin', departmentKey, warnings };
    }

    /**
     * Намёк отдела: «15»/«D_15» → id 15; «ОП Центр» → поиск по названию.
     * Битрикс-робот может слать и id, и название отдела — поддержаны оба.
     */
    private parseDepartmentHint(raw: string | undefined): {
        id: number | null;
        name: string | null;
    } {
        const text = (raw ?? '').trim();
        if (!text) return { id: null, name: null };
        // Строка целиком «числовая» (возможно с префиксом) → это id.
        const idMatch = /^(?:[A-Za-z_]*_)?(\d+)$/.exec(text);
        if (idMatch) {
            const id = Number(idMatch[1]);
            return Number.isFinite(id) && id > 0
                ? { id, name: null }
                : { id: null, name: null };
        }
        return { id: null, name: this.normalizeName(text) };
    }

    /** Нормализация названия отдела для нестрогого сравнения. */
    private normalizeName(raw: string): string {
        return raw.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /** Совпадение названий: равенство либо вхождение в любую сторону. */
    private nameMatches(candidate: string | undefined, hint: string): boolean {
        const normalized = this.normalizeName(candidate ?? '');
        if (!normalized) return false;
        return normalized.includes(hint) || hint.includes(normalized);
    }

    /**
     * Кандидаты: сотрудники отдела/группы по намёку; без намёка при
     * самопередаче — отдел передающего (заявка остаётся в его ОП);
     * иначе все сотрудники всех ОП. Отсортированы по ID — курсор
     * детерминирован.
     */
    private async collectCandidates(
        domain: string,
        hint: { id: number | null; name: string | null },
        item: ILeadToWorkItem,
        warnings: string[],
    ): Promise<{ candidates: number[]; departmentKey: string }> {
        // userId=0: пользовательская часть структуры здесь не нужна.
        const data = await this.structure.getStructure(
            domain,
            EDepartamentGroup.sales,
            0,
        );

        let users: ICandidateUser[] | null = null;
        let departmentKey = 'all';

        // Самопередача без явного намёка: отдел — у передающего сотрудника.
        if (hint.id === null && hint.name === null && item.transferredBy) {
            for (const sales of data.salesDepartments ?? []) {
                const hasUser = (sales.allUsers ?? []).some(
                    user => Number(user?.ID) === item.transferredBy,
                );
                if (hasUser) {
                    users = sales.allUsers ?? [];
                    departmentKey = `op_${Number(sales.department?.ID)}`;
                    break;
                }
            }
        }

        if (!users && (hint.id !== null || hint.name !== null)) {
            for (const sales of data.salesDepartments ?? []) {
                const opMatched =
                    hint.id !== null
                        ? Number(sales.department?.ID) === hint.id
                        : this.nameMatches(sales.department?.NAME, hint.name!);
                if (opMatched) {
                    users = sales.allUsers ?? [];
                    departmentKey = `op_${Number(sales.department?.ID)}`;
                    break;
                }
                const group = (sales.groups ?? []).find(g =>
                    hint.id !== null
                        ? Number(g.ID) === hint.id
                        : this.nameMatches(g.NAME, hint.name!),
                );
                if (group) {
                    users = group.USERS ?? [];
                    departmentKey = `group_${Number(group.ID)}`;
                    break;
                }
            }

            /*
             * Битрикс присылает подразделение по своему маппингу «код
             * партнёра → отдел», и это может быть ЛЮБОЙ подотдел ОП, а не
             * только названный «Группа …» (в `groups` попадают лишь они).
             * Ищем по всей структуре: без этого верный намёк молча
             * превращался бы в выбор по всем отделам продаж.
             */
            if (!users) {
                const child = (data.department?.childrenDepartments ?? []).find(
                    dep =>
                        hint.id !== null
                            ? Number(dep.ID) === hint.id
                            : this.nameMatches(dep.NAME, hint.name!),
                );
                if (child) {
                    const childUsers = child.USERS ?? [];
                    departmentKey = `dep_${Number(child.ID)}`;
                    if (childUsers.length > 0) {
                        users = childUsers;
                    } else {
                        // Подразделение есть, но пустое: молча уходить во
                        // «все ОП» нельзя — заявка уедет не в тот отдел.
                        const parent = (data.salesDepartments ?? []).find(
                            sales =>
                                Number(sales.department?.ID) ===
                                Number(child.PARENT),
                        );
                        if (parent) {
                            users = parent.allUsers ?? [];
                            departmentKey = `op_${Number(parent.department?.ID)}`;
                            warnings.push(
                                `В подразделении «${child.NAME ?? child.ID}» нет сотрудников — выбор по отделу «${parent.department?.NAME ?? ''}»`,
                            );
                        }
                    }
                }
            }
            if (!users) {
                warnings.push(
                    `Отдел «${hint.id ?? hint.name}» из намёка не найден среди ОП — ответственный выбран по всем отделам продаж`,
                );
            }
        }

        if (!users) {
            users = data.department?.allUsers ?? [];
        }

        const candidates = users
            .filter(user => user.ACTIVE !== false)
            .map(user => Number(user.ID))
            .filter(id => Number.isFinite(id) && id > 0)
            .sort((a, b) => a - b);
        return { candidates: [...new Set(candidates)], departmentKey };
    }

    /**
     * Round-robin: берём первого кандидата с ID больше прошлого выбранного;
     * список кончился — идём по кругу. Курсор хранит userId (не индекс),
     * поэтому изменение состава отдела не сбивает очередь.
     */
    private async nextByCursor(
        domain: string,
        departmentKey: string,
        candidates: number[],
    ): Promise<number> {
        const key = `rr:${departmentKey}`;
        const cursor = await this.appCache.get<IAssigneeCursor>({
            app: ASSIGNEE_CACHE_APP,
            domain,
            key,
        });

        const lastUserId = cursor?.lastUserId ?? 0;
        const next = candidates.find(id => id > lastUserId) ?? candidates[0];

        await this.appCache.set({
            app: ASSIGNEE_CACHE_APP,
            domain,
            key,
            group: 'assignee-cursor',
            data: { lastUserId: next } satisfies IAssigneeCursor,
            ttlSeconds: ASSIGNEE_CURSOR_TTL_SECONDS,
        });
        return next;
    }
}
