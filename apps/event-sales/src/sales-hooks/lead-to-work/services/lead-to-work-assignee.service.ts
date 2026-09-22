import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { BxDepartmentStructureService } from 'libs/bx-department/services/bx-department-structure.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { sameCity } from '@lib/shared/lib/cities';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';

/** Минимум, который нужен от сотрудника структуры (структурная типизация). */
interface ICandidateUser {
    ID?: number | string;
    ACTIVE?: boolean;
}

/**
 * Короче этого намёк по вхождению не ищется: «оп» входит в названия всех
 * отделов продаж сразу, и выбор свёлся бы к порядку ответа Битрикса.
 */
const MIN_HINT_LENGTH = 3;

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
    /**
     * Живая проверка «кто из кандидатов ещё работает» — по свежему
     * `user.get`, минуя суточный кеш структуры отделов. Уволенный утром
     * сотрудник иначе получал бы заявки до следующего дня. Не передан —
     * верим структуре (тесты, вызовы без Битрикса).
     */
    activeUserIds?: (ids: number[]) => Promise<Set<number>>;
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
        /** Соответствие «Отдел строка» → отдел продаж (настройка портала). */
        private readonly appSettings: PortalAppSettingsService,
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

        const hint = this.parseDepartmentHint(
            await this.applyAlias(domain, item.department, warnings),
        );
        const { candidates: allCandidates, departmentKey } =
            await this.collectCandidates(domain, hint, item, warnings);

        // Передача: прежний ответственный исключается — заявка не должна
        // вернуться ему же (если он не единственный в отделе).
        const excluded = item.excludeResponsible ?? null;
        const withoutPrevious =
            excluded && allCandidates.length > 1
                ? allCandidates.filter(id => id !== excluded)
                : allCandidates;

        /*
         * РУКОВОДИТЕЛИ ИЗ КРУГА ИСКЛЮЧАЮТСЯ.
         *
         * Round-robin раздаёт рядовую работу, а руководитель отдела и его
         * заместители в очереди на обзвон стоять не должны — до этой правки
         * заявки уезжали и к ним наравне со всеми.
         *
         * Если после отсева не осталось никого (отдел состоит из одних
         * руководителей), берём исходный список: назначить руководителю
         * лучше, чем не назначить никому.
         */
        const heads = await this.headUserIds(domain, departmentKey);
        const withoutHeads = withoutPrevious.filter(id => !heads.has(id));
        const withHeadsFallback = withoutHeads.length
            ? withoutHeads
            : withoutPrevious;
        if (!withoutHeads.length && withoutPrevious.length) {
            warnings.push(
                'В отделе не осталось кандидатов кроме руководителей — назначаем руководителю',
            );
        }
        /*
         * УВОЛЕННЫЕ В КРУГЕ НЕ УЧАСТВУЮТ (требование владельца 22.09.2026).
         * Структура читает только активных, но кешируется на сутки: 16.09 две
         * заявки ушли Юлии Юрцевич уже после увольнения и так и висят
         * «Назначена». Поэтому перед выбором спрашиваем портал заново.
         */
        const candidates = await this.keepActive(
            withHeadsFallback,
            context.activeUserIds,
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

    /**
     * Только работающие сейчас кандидаты. Проверка не удалась — оставляем
     * список как есть с предупреждением: не назначить заявку хуже, чем
     * назначить по вчерашней структуре. Все уволены — пусто.
     */
    private async keepActive(
        candidates: number[],
        activeUserIds: ILeadToWorkAssigneeContext['activeUserIds'],
        warnings: string[],
    ): Promise<number[]> {
        if (!activeUserIds || !candidates.length) return candidates;
        try {
            const active = await activeUserIds(candidates);
            const alive = candidates.filter(id => active.has(id));
            const dismissed = candidates.length - alive.length;
            if (dismissed > 0) {
                this.logger.log(
                    `[assignee] из круга исключены уволенные: ${dismissed}`,
                );
            }
            if (!alive.length) {
                warnings.push(
                    'Все кандидаты отдела уволены — назначать некому.',
                );
            }
            return alive;
        } catch (error) {
            warnings.push(
                `Не удалось проверить, кто из кандидатов работает (${(error as Error).message}) — круг по структуре отделов`,
            );
            return candidates;
        }
    }

    /**
     * Руководители ЦЕЛЕВОГО отдела продаж (руководитель + заместители) — из
     * HEADS структуры, с откатом на легаси `UF_HEAD`. Структура недоступна —
     * пустое множество: круг тогда работает как раньше, без отсева.
     *
     * Почему только целевого: руководитель воронежского ОП бывает рядовым
     * продавцом в питерском. Плоский набор «руководители всего портала»
     * вычёркивал его и из питерского круга, а в маленьком отделе мог
     * обнулить круг целиком. `departmentKey` приходит из
     * {@link collectCandidates} в виде `op_15` / `group_16` / `dep_21`.
     */
    private async headUserIds(
        domain: string,
        departmentKey: string,
    ): Promise<Set<number>> {
        const heads = new Set<number>();
        const targetOpId = /^op_(\d+)$/.exec(departmentKey)?.[1];
        try {
            const data = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                0,
            );
            for (const sales of data.salesDepartments ?? []) {
                // Целевой ОП известен — чужих руководителей не трогаем.
                if (
                    targetOpId &&
                    String(Number(sales.department?.ID)) !== targetOpId
                ) {
                    continue;
                }
                const department = sales.department as
                    | { HEADS?: number[]; UF_HEAD?: number | null }
                    | undefined;
                for (const raw of department?.HEADS ?? []) {
                    const id = Number(raw);
                    if (Number.isInteger(id) && id > 0) heads.add(id);
                }
                const legacy = Number(department?.UF_HEAD);
                if (Number.isInteger(legacy) && legacy > 0) heads.add(legacy);
            }
        } catch (error) {
            this.logger.warn(
                `Структура отделов ${domain} не прочитана (${(error as Error).message}) — ` +
                    'руководители из круга не исключены',
            );
        }
        return heads;
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

    /**
     * Город из поля «Отдел строка» → отдел продаж, как задано настройкой
     * портала (`lead_intake_department_aliases`).
     *
     * Зачем: бизнес-процесс пишет в лид короткое «Питер», а отдел на портале
     * называется «ОП САНКТ-ПЕТЕРБУРГ (ОП)» — сравнение по вхождению их не
     * связывает, и ночная заявка 18.09.2026 ушла в общий круг, то есть в
     * Воронеж. На каждом портале названия свои, поэтому соответствие
     * настраивается, а не зашито в код.
     *
     * Пусто в настройке или нет пары — возвращаем намёк как есть: прежнее
     * поведение сохраняется.
     */
    private async applyAlias(
        domain: string,
        raw: string | undefined,
        warnings: string[],
    ): Promise<string | undefined> {
        const hint = (raw ?? '').trim();
        if (!hint) {
            warnings.push(
                'Отдел заявки не указан («Отдел строка» пусто) — выбор по кругу из всех ОП',
            );
            return raw;
        }
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            const alias = this.findAlias(
                settings.leadIntakeDepartmentAliases,
                hint,
            );
            if (!alias) return raw;
            this.logger.log(
                `[assignee] отдел «${hint}» по настройке портала → «${alias}»`,
            );
            return alias;
        } catch (error) {
            warnings.push(
                `Соответствие отделов не прочитано (${(error as Error).message}) — намёк взят как есть`,
            );
            return raw;
        }
    }

    /** Значение пары «город=отдел» из настройки; пары нет — null. */
    private findAlias(raw: string, hint: string): string | null {
        const wanted = this.normalizeName(hint);
        for (const pair of raw.split(';')) {
            const [key, ...rest] = pair.split('=');
            const value = rest.join('=').trim();
            if (!value) continue;
            if (this.normalizeName(key) === wanted) return value;
        }
        return null;
    }

    /** Нормализация названия отдела для нестрогого сравнения. */
    private normalizeName(raw: string): string {
        return raw.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Совпадение названий: равенство, вхождение в любую сторону либо ОДИН
     * ГОРОД по справочнику написаний. Последнее и связывает «Питер» из лида
     * с отделом «ОП САНКТ-ПЕТЕРБУРГ (ОП)» — сравнение строк их не связывало,
     * и ночная заявка 18.09.2026 уехала в чужой город.
     */
    private nameMatches(candidate: string | undefined, hint: string): boolean {
        const normalized = this.normalizeName(candidate ?? '');
        if (!normalized) return false;
        // Город — самый сильный сигнал, поэтому спрашиваем справочник ПЕРВЫМ.
        if (sameCity(normalized, hint)) return true;
        if (normalized === hint) return true;
        /*
         * Вхождение — последняя и самая слабая проверка, и только для
         * намёков длиннее трёх букв: короткое «оп» входит и в «ОП Воронеж»,
         * и в «ОП Тест», и в «Отдел продаж Ростов» — побеждал бы первый по
         * порядку, который отдал Битрикс, молча и без предупреждения.
         */
        if (hint.length <= MIN_HINT_LENGTH) return false;
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

        /*
         * Самопередача без явного намёка: заявка остаётся в ОП передающего.
         *
         * Сотрудник бывает в НЕСКОЛЬКИХ отделах продаж сразу, и тогда он
         * лежит в `allUsers` каждого из них. Раньше брался первый попавшийся
         * — то есть отдел выбирал порядок ответа Битрикса, а не человек:
         * заявка молча уезжала в чужой город и прокручивала там курсор
         * очереди. Теперь несколько отделов — не угадываем: отдаём пустой
         * список и предупреждение, как в ветке «отдел не найден».
         */
        if (hint.id === null && hint.name === null && item.transferredBy) {
            const owned = (data.salesDepartments ?? []).filter(sales =>
                (sales.allUsers ?? []).some(
                    user => Number(user?.ID) === item.transferredBy,
                ),
            );
            if (owned.length === 1) {
                users = owned[0].allUsers ?? [];
                departmentKey = `op_${Number(owned[0].department?.ID)}`;
            } else if (owned.length > 1) {
                const names = owned
                    .map(sales => String(sales.department?.NAME ?? '').trim())
                    .filter(Boolean)
                    .join(', ');
                warnings.push(
                    `Сотрудник ${item.transferredBy} состоит в нескольких отделах продаж (${names}) — ` +
                        'отдел заявки не определён, назначать некому: круг идёт только внутри своего отдела.',
                );
                return { candidates: [], departmentKey: 'none' };
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
                    `Отдел «${hint.id ?? hint.name}» не найден среди ОП — ` +
                        'назначать некому: круг идёт ТОЛЬКО внутри своего ' +
                        'отдела. Проверьте соответствие городов и отделов в ' +
                        'настройках портала.',
                );
            }
        }

        /*
         * КРУГ ТОЛЬКО ВНУТРИ ЦЕЛЕВОГО ОТДЕЛА (требование владельца
         * 18.09.2026). Раньше ненайденный отдел означал выбор по всем ОП
         * сразу, и питерская заявка могла уехать в Воронеж или Ростов. Это
         * хуже, чем неназначенная заявка: неназначенную видно и её разберут,
         * а уехавшую в чужой город замечают через сутки.
         */
        if (!users) {
            if (!hint.id && !hint.name) {
                warnings.push(
                    'Отдел заявки неизвестен — назначать некому: круг идёт ' +
                        'только внутри своего отдела.',
                );
            }
            return { candidates: [], departmentKey: 'none' };
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
