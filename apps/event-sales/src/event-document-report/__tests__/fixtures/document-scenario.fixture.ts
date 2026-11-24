/**
 * Константы сценария потока документов: идентификаторы, даты и bitrixId фейкового портала.
 */

// === Константы сценария ===
export const DOCUMENT_DOMAIN = 'a.bitrix24.ru';
export const DOCUMENT_EVENT_ID = 'ev-1';
export const DOCUMENT_USER_ID = 15;
export const DOCUMENT_COMPANY_ID = 700;
export const DOCUMENT_BASE_DEAL_ID = 5000;
export const DOCUMENT_PRESENTATION_DEAL_ID = 9100;
/** 09:00 UTC = 12:00 в Москве. */
export const DOCUMENT_CREATED_AT = '2026-11-24T09:00:00.000Z';
/** Тот же момент в поясе Москвы, формат CRM-поля. */
export const DOCUMENT_CREATED_AT_MOSCOW = '24.11.2026 12:00:00';

/** bitrixId воронки «ОП Основная» на фейковом портале. */
export const BASE_CATEGORY_BITRIX_ID = '7';
/** bitrixId воронки «Презентации» на фейковом портале. */
export const PRESENTATION_CATEGORY_BITRIX_ID = '9';
/** bitrixId варианта `work` поля «ОП Статус работы». */
export const WORK_STATUS_ITEM_BITRIX_ID = 101;
/** bitrixId варианта `op_prospects_good` поля «ОП Перспективность». */
export const PROSPECTS_GOOD_ITEM_BITRIX_ID = 201;
