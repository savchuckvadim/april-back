/**
 * Запуск холодного обзвона: «выигрывает первый».
 *
 * Зачем (gsr 20.11.2026): хук ждал в очереди 6 минут, менеджер не дождался и
 * запустил ХО ещё раз. Запуски попали в разные окна тишины, отработали оба,
 * и второй перезаписал работу первого. То же делал крон подстраховки:
 * хук, ждущий в очереди дольше порога, он считал потерянным и досылал.
 *
 * Правило: запуск, принятый РАНЬШЕ, чем по этому же клиенту завершился
 * предыдущий запуск, отправлен «вслепую» — пока первый ещё выполнялся. Он
 * не выполняется; в карточку пишется, что делать. Запуск, принятый ПОСЛЕ
 * завершения предыдущего, — новое осознанное решение, он идёт как обычно.
 *
 * Чистые функции и типы, без Redis и Битрикса.
 */

/** Отметка запуска: ставится при приёме хука и едет в его данных. */
export interface XoLaunch {
    /** Номер запуска: опознать повторную доставку того же окна. */
    id: string;
    /** Когда хук принят нашим бэкендом, мс (Date.now). */
    acceptedAt: number;
}

/** Последний завершённый запуск по клиенту. */
export interface XoLaunchDone {
    launchId: string;
    acceptedAt: number;
    finishedAt: number;
}

/** Ссылка на запуск в реестре: чей и какой. */
export interface XoLaunchRef {
    /** Ключ сущности: `company:7`, `deal:500`. */
    entityKey: string;
    launchId: string;
}

export type XoLaunchVerdict =
    /** Работать как обычно. */
    | 'proceed'
    /** Повторный запуск, пока выполнялся предыдущий: пропустить и объяснить. */
    | 'repeat'
    /** То же окно доставлено второй раз (очередь после падения): молча. */
    | 'redelivered';

export const decideXoLaunch = (
    launch: XoLaunch | undefined,
    lastDone: XoLaunchDone | null,
): XoLaunchVerdict => {
    // Хук принят до выкладки правила — отметки нет, ведём себя как раньше.
    if (!launch || !lastDone) return 'proceed';
    if (lastDone.launchId === launch.id) return 'redelivered';
    if (lastDone.finishedAt > launch.acceptedAt) return 'repeat';
    return 'proceed';
};

/** Запись в карточку о пропущенном повторе — для менеджера, без кодов. */
export const XO_LAUNCH_REPEAT_NOTE =
    'Повторный запуск холодного обзвона пропущен: предыдущий запуск по ' +
    'этому клиенту ещё выполнялся, работа уже создана им. Если нужен новый ' +
    'обзвон — запустите его ещё раз.';

/** Ключ сущности в реестре запусков. */
export const xoLaunchEntityKey = (
    entityType: string,
    entityId: string | number,
): string => `${entityType.toLowerCase()}:${String(entityId)}`;

/**
 * Реестр запусков (порт). Реализация — Redis (`XoLaunchRegistryService`).
 * Любой сбой реестра — «ничего не известно»: обработка идёт как до правила.
 */
export interface XoLaunchRegistry {
    /** Хук принят и ждёт обработки (для крона подстраховки). */
    markPending(
        domain: string,
        entityKey: string,
        launch: XoLaunch,
    ): Promise<void>;
    /** Окно обработано (или упало) — хуки больше не ждут. */
    clearPending(domain: string, refs: readonly XoLaunchRef[]): Promise<void>;
    /** Какие сущности ждут обработки; null — реестр не ответил. */
    pending(
        domain: string,
        entityKeys: readonly string[],
    ): Promise<ReadonlySet<string> | null>;
    /** Последние завершённые запуски по клиентам. */
    lastDone(
        domain: string,
        clientKeys: readonly string[],
    ): Promise<ReadonlyMap<string, XoLaunchDone>>;
    /** Запуски, создавшие работу (или уступившие чужой), завершены. */
    markDone(
        domain: string,
        items: readonly { clientKey: string; launch: XoLaunch }[],
        finishedAt: number,
    ): Promise<void>;
}
