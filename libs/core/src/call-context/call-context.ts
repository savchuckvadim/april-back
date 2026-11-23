import { AsyncLocalStorage } from 'async_hooks';

/**
 * Класс текущей работы: человек ждёт у экрана или это фон.
 *
 * Зачем (разбор нагрузки 05.10.2026). Лимит Битрикса — 2 запроса в секунду
 * на портал, общий на все наши приложения. Ограничитель не различал, кто
 * спрашивает: ночной обход сделок, отчёт по дублям и AI-разбор звонков
 * стояли в одной очереди с менеджером, открывшим карточку, и выедали запас.
 * Теперь у каждой работы есть класс, и потребители ограниченного ресурса
 * (первый — ограничитель запросов Битрикса) держат менеджерам место.
 *
 * Класс не передаётся параметром через сотни вызовов — он лежит в
 * асинхронном контексте (AsyncLocalStorage) и читается там, где нужен.
 * Контекст наследуется всей асинхронной работой, начатой внутри него, —
 * в том числе НЕ ожидаемой (`void doWork()`): фон, запущенный из
 * HTTP-запроса, обязан понизить класс сам (`runAsBackground`).
 */
export const CALL_CLASS = {
    /** Человек ждёт у экрана: открытие карточки, отчёт, присоединение. */
    interactive: 'interactive',
    /** Кроны, очереди, вебхуки роботов, AI — подождут. */
    background: 'background',
} as const;

export type CallClass = (typeof CALL_CLASS)[keyof typeof CALL_CLASS];

/**
 * Типы карточек, над которыми идёт работа, — для подписи тревог и журнала
 * сбоев Битрикса («сделка 26735»).
 */
export const CALL_ENTITY_TYPES = [
    'deal',
    'company',
    'lead',
    'contact',
    'task',
    'smart',
] as const;

export type CallEntityType = (typeof CALL_ENTITY_TYPES)[number];

/** Карточка, ради которой идёт работа. */
export interface CallEntity {
    type: CallEntityType;
    id: string;
}

/** Сотрудник, от имени которого идёт работа. */
export interface CallActor {
    userId: number;
    name?: string;
}

export interface CallContext {
    callClass: CallClass;
    /** Кто работает — маршрут, имя крона или очереди. Для логов. */
    source: string;
    /**
     * Что делаем — по-русски, для людей: «Отчёт «Звонки»», «Хук: холодный
     * обзвон», «Крон: подстраховка ХО». Попадает в тревоги и журнал сбоев.
     */
    operation?: string;
    /** Портал, если работа идёт ради одного портала. */
    domain?: string;
    entity?: CallEntity;
    actor?: CallActor;
}

/** Описание работы, которое дописывают по ходу (см. annotateCallContext). */
export type CallContextAnnotation = Partial<
    Pick<CallContext, 'operation' | 'domain' | 'entity' | 'actor'>
>;

const storage = new AsyncLocalStorage<CallContext>();

/**
 * Без контекста работа считается ФОНОВОЙ. Кроны и обработчики очередей
 * контекст не ставят — значит, забытая разметка не отнимет место у
 * менеджеров; интерактив помечается явно (HTTP-запросы — автоматически,
 * см. call-context.middleware).
 */
const DEFAULT_CONTEXT: CallContext = {
    callClass: CALL_CLASS.background,
    source: 'unmarked',
};

export const getCallContext = (): CallContext =>
    storage.getStore() ?? DEFAULT_CONTEXT;

export const runWithCallContext = <T>(context: CallContext, work: () => T): T =>
    storage.run(context, work);

/** Работа для человека у экрана (в т.ч. очередь, исполняющая его отчёт). */
export const runAsInteractive = <T>(source: string, work: () => T): T =>
    runWithCallContext({ callClass: CALL_CLASS.interactive, source }, work);

/**
 * Фоновая работа, запущенная внутри HTTP-запроса: вебхук робота, ручной
 * запуск крона. Сам запрос помечен интерактивным — здесь класс понижается.
 */
export const runAsBackground = <T>(source: string, work: () => T): T =>
    runWithCallContext({ callClass: CALL_CLASS.background, source }, work);

/**
 * Дописать в ТЕКУЩИЙ контекст, что за работа идёт: операцию, портал,
 * карточку, сотрудника. Контекст — один объект на всю асинхронную работу
 * внутри него, поэтому дописанное видно и дальше по цепочке вызовов (так
 * тревога Битрикса узнаёт, ради какой карточки шёл запрос).
 *
 * Пустые поля патча ничего не стирают. Вне контекста (крон без разметки,
 * тест) — ничего не делает: подпись тревог не стоит падения работы.
 *
 * Подпись, собираемая из DTO или данных джоба, передаётся функцией:
 * `annotateCallContext(() => eventReportCallContext(dto))` — тогда и
 * ошибка сборки (неожиданная форма данных) не ломает ручку или очередь.
 */
export const annotateCallContext = (
    patch: CallContextAnnotation | (() => CallContextAnnotation),
): void => {
    try {
        const store = storage.getStore();
        if (!store) return;
        const value = typeof patch === 'function' ? patch() : patch;
        if (value.operation !== undefined) store.operation = value.operation;
        if (value.domain !== undefined) store.domain = value.domain;
        if (value.entity !== undefined) store.entity = value.entity;
        if (value.actor !== undefined) store.actor = value.actor;
    } catch {
        // Подпись — вспомогательная: работа идёт дальше без неё.
    }
};

/**
 * Точка входа фоновой работы (крон, обработчик очереди): на каждый вызов —
 * свой фоновый контекст, параллельные джобы друг друга не видят.
 *
 * Вложенный вызов (ручной запуск крона из HTTP, помеченный метод зовёт
 * другой помеченный) описание работы не теряет: операция, портал, карточка
 * и сотрудник берутся у внешнего контекста, меняется только source.
 */
export const runAsCallSource = <T>(
    source: string,
    operation: string | undefined,
    work: () => T,
): T => {
    const outer = storage.getStore();
    const context: CallContext = {
        callClass: CALL_CLASS.background,
        source,
    };
    const inheritedOperation = outer?.operation ?? operation;
    if (inheritedOperation) context.operation = inheritedOperation;
    if (outer?.domain) context.domain = outer.domain;
    if (outer?.entity) context.entity = outer.entity;
    if (outer?.actor) context.actor = outer.actor;
    return runWithCallContext(context, work);
};

/** Карточка для контекста; пустой или нулевой id — карточки нет. */
export const callEntity = (
    type: CallEntityType,
    id: string | number | null | undefined,
): CallEntity | undefined => {
    const text = id === null || id === undefined ? '' : String(id).trim();
    return text && text !== '0' ? { type, id: text } : undefined;
};

/**
 * Сотрудник для контекста: число или `user_12` (так id печатают роботы и
 * бизнес-процессы Битрикса); пусто или мусор — сотрудника нет.
 */
export const callActor = (
    userId: string | number | null | undefined,
    name?: string,
): CallActor | undefined => {
    if (userId === null || userId === undefined) return undefined;
    const id = Number(
        String(userId)
            .trim()
            .replace(/^user_/i, ''),
    );
    if (!Number.isInteger(id) || id <= 0) return undefined;
    const cleanName = name?.trim();
    return cleanName ? { userId: id, name: cleanName } : { userId: id };
};
