import { IPortal } from "@/modules/portal/interfaces/portal.interface";
import { BXApiSchema, TBXRequest, TBXResponse } from "../domain";
import { IBitrixBatchResponseResult, IBitrixResponse } from "./bitrix-api-http.intterface";


/**
 * Универсальный интерфейс для работы с Bitrix24 REST API.
 * Поддерживает:
 *  - Инициализацию через портал
 *  - Проверку и обновление токена
 *  - Вызовы методов
 *  - Типизированные вызовы (по схеме BXApiSchema)
 *  - Batch-запросы
 */
export interface IBitrixApi {
  /** Домен портала Bitrix24 (например, april-garant.bitrix24.ru) */
  domain: string;

  /** Актуальный токен авторизации */
//   token?: string;

  /** Внутренний API-ключ приложения (если есть) */
//   apiKey?: string;

  /** Объект команд для batch-запросов */
//   cmdBatch?: Record<string, string>;

  /** Инициализация API на основе данных портала */
  initFromPortal?(portal: IPortal):  void;

  /** Инициализация API с авторизацией */
  initAuthApi?(domain: string): Promise<void>;

  /**
   * Проверяет срок жизни токена, при необходимости — обновляет.
   * Возвращает гарантированно свежий access_token.
   */
//   getFreshToken?(domain: string): Promise<string>;

  /**
   * Выполняет обычный REST-запрос к Bitrix24.
   * @param method - например, "user.get" или "crm.deal.list"
   * @param data - объект параметров
   * @returns ответ Bitrix API
   */
  call<T = any>(method: string, data: Record<string, any>): Promise<T>;

  /**
   * Типизированный вызов REST-метода по схеме BXApiSchema.
   * @example
   * api.callType('crm', 'deal', 'list', { filter: { CATEGORY_ID: 2 } });
   */
  callType<
    NAMESPACE extends keyof BXApiSchema,
    ENTITY extends keyof BXApiSchema[NAMESPACE],
    METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
  >(
    namespace: NAMESPACE,
    entity: ENTITY,
    method: METHOD,
    data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
  ): Promise<IBitrixResponse<TBXResponse<NAMESPACE, ENTITY, METHOD>>>;

  /**
   * Добавление команды в batch-запрос.
   * @param cmd - имя команды (ключ)
   * @param method - метод Bitrix API
   * @param query - параметры запроса
   */
  addCmdBatch?(cmd: string, method: string, query: Record<string, any>): void;

  /**
   * Добавление типизированной команды в batch-запрос.
   */
  addCmdBatchType?<
    NAMESPACE extends keyof BXApiSchema,
    ENTITY extends keyof BXApiSchema[NAMESPACE],
    METHOD extends keyof BXApiSchema[NAMESPACE][ENTITY],
  >(
    cmd: string,
    namespace: NAMESPACE,
    entity: ENTITY,
    method: METHOD,
    data: TBXRequest<NAMESPACE, ENTITY, METHOD>,
  ): void;

  /**
   * Выполнение batch-команд (до 50 за один запрос).
   * Можно ограничить параллельность.
   * @param limit — количество параллельных batch-запросов
   */
  callBatch?(limit?: number): Promise<IBitrixBatchResponseResult[]>;

  /**
   * Выполняет одиночный batch-запрос на 50 команд.
   * @param batch — массив пар [cmd, query]
   */
//   executeBatch?(batch: [string, string][]): Promise<IBitrixBatchResponseResult | null>;

  /**
   * Обработка ошибок batch-запросов и логирование.
   */
//   handleBatchErrors?(result: IBitrixBatchResponseResult, context?: string): Promise<void>;

  /**
   * Преобразует объект данных в query string формата Bitrix24 REST.
   * Например:
   *   { filter: { ID: 5 } } → "crm.deal.list?filter[ID]=5"
   */
//   dictToQueryString?(method: string, data: Record<string, any>): string;

  /**
   * Очищает результаты batch-запросов, возвращая только полезные данные.
   */
//   clearResult?(result: IBitrixBatchResponseResult[]): any[];

  /**
   * Принудительно "усыпляет" выполнение на заданное время.
   */
//   sleep?(ms: number): Promise<void>;
}
