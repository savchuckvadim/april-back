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

/** Итог резолва ответственного. */
export interface ILeadToWorkAssignee {
    /** null — кандидатов нет (отдел пуст/не найден). */
    responsible: number | null;
    /** explicit — пришёл в хук; round-robin — выбран по курсору отдела. */
    source: 'explicit' | 'round-robin';
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
    ): Promise<ILeadToWorkAssignee> {
        if (item.responsible) {
            return {
                responsible: item.responsible,
                source: 'explicit',
                departmentKey: null,
                warnings: [],
            };
        }

        const warnings: string[] = [];
        // Формат намёка неизвестен — фиксируем сырое значение в логах.
        this.logger.log(
            `[assignee] lead=${item.leadId} responsible не передан; ` +
                `департамент-намёк: "${item.department ?? ''}"`,
        );

        const hintedId = this.parseDepartmentHint(item.department);
        const { candidates, departmentKey } = await this.collectCandidates(
            domain,
            hintedId,
            warnings,
        );
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

    /** «15», «D_15», «department_15» → 15; мусор/пусто → null. */
    private parseDepartmentHint(raw: string | undefined): number | null {
        const match = /(\d+)/.exec(raw ?? '');
        if (!match) return null;
        const id = Number(match[1]);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    /**
     * Кандидаты: сотрудники отдела/группы по намёку, иначе все сотрудники
     * всех ОП. Отсортированы по ID — курсор детерминирован.
     */
    private async collectCandidates(
        domain: string,
        hintedId: number | null,
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

        if (hintedId !== null) {
            for (const sales of data.salesDepartments ?? []) {
                if (Number(sales.department?.ID) === hintedId) {
                    users = sales.allUsers ?? [];
                    departmentKey = `op_${hintedId}`;
                    break;
                }
                const group = (sales.groups ?? []).find(
                    g => Number(g.ID) === hintedId,
                );
                if (group) {
                    users = group.USERS ?? [];
                    departmentKey = `group_${hintedId}`;
                    break;
                }
            }
            if (!users) {
                warnings.push(
                    `Отдел «${hintedId}» из намёка не найден среди ОП — ответственный выбран по всем отделам продаж`,
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
