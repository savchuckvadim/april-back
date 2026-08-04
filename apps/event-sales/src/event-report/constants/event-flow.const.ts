/** Пространство ключей операции в AppCache (app-колонка). */
export const EVENT_FLOW_CACHE_APP = 'event-sales-flow';

/**
 * Сколько живёт статус операции. Час — с запасом: менеджер узнаёт результат
 * за секунды, а хвост нужен на случай «закрыл фрейм, вернулся, проверил».
 */
export const EVENT_FLOW_STATUS_TTL_SECONDS = 60 * 60;

/**
 * События WS. Клиент присылает свой socketId в теле flow-запроса и получает
 * push сразу по завершении — поллинг остаётся фолбэком на случай, когда
 * сокета нет (иной процесс-реплика, оборванное соединение).
 */
export const EVENT_FLOW_WS_EVENTS = {
    DONE: 'event-sales-flow:done',
    ERROR: 'event-sales-flow:error',
} as const;
