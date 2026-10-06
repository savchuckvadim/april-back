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

export interface CallContext {
    callClass: CallClass;
    /** Кто работает — маршрут, имя крона или очереди. Для логов. */
    source: string;
}

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
