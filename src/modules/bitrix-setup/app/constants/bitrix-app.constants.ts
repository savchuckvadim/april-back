// // Константы для модуля Bitrix Setup App

// export const BITRIX_APP_TYPES = {
//     WEBHOOK: 'webhook',
//     APPLICATION: 'application',
//     BOT: 'bot',
//     WIDGET: 'widget',
// } as const;

// export const BITRIX_APP_STATUSES = {
//     ACTIVE: 'active',
//     INACTIVE: 'inactive',
//     PENDING: 'pending',
//     SUSPENDED: 'suspended',
// } as const;

// export const BITRIX_APP_GROUPS = {
//     CRM: 'crm',
//     TASKS: 'tasks',
//     CALENDAR: 'calendar',
//     CHAT: 'chat',
//     DOCUMENTS: 'documents',
//     MARKETPLACE: 'marketplace',
// } as const;

// export const API_ENDPOINTS = {
//     STORE_OR_UPDATE: 'store-or-update',
//     GET: 'get',
//     ALL: 'all',
//     GET_BY_PORTAL: 'get-by-portal',
//     UPDATE: ':id',
//     DELETE: ':id',
// } as const;

// export const HTTP_STATUS_CODES = {
//     OK: 200,
//     CREATED: 201,
//     BAD_REQUEST: 400,
//     UNAUTHORIZED: 401,
//     FORBIDDEN: 403,
//     NOT_FOUND: 404,
//     INTERNAL_SERVER_ERROR: 500,
// } as const;

// export const ERROR_MESSAGES = {
//     APP_NOT_FOUND: 'Bitrix App not found',
//     APPS_NOT_FOUND: 'Bitrix Apps not found',
//     APP_FAILED: 'Bitrix App failed',
//     VALIDATION_FAILED: 'Validation failed',
//     PORTAL_NOT_FOUND: 'Portal not found',
//     DATABASE_ERROR: 'Database connection error',
// } as const;

// export const SUCCESS_MESSAGES = {
//     APP_CREATED: 'App created successfully',
//     APP_UPDATED: 'App updated successfully',
//     APP_DELETED: 'App deleted successfully',
//     APP_SAVED: 'Bitrix App saved',
// } as const;

// // Типы для TypeScript
// export type BitrixAppType = typeof BITRIX_APP_TYPES[keyof typeof BITRIX_APP_TYPES];
// export type BitrixAppStatus = typeof BITRIX_APP_STATUSES[keyof typeof BITRIX_APP_STATUSES];
// export type BitrixAppGroup = typeof BITRIX_APP_GROUPS[keyof typeof BITRIX_APP_GROUPS];

// // Валидационные массивы
// export const VALID_APP_TYPES = Object.values(BITRIX_APP_TYPES);
// export const VALID_APP_STATUSES = Object.values(BITRIX_APP_STATUSES);
// export const VALID_APP_GROUPS = Object.values(BITRIX_APP_GROUPS);

// // Конфигурация шифрования
// export const ENCRYPTION_CONFIG = {
//     ALGORITHM: 'aes-256-cbc',
//     SALT: 'salt',
//     KEY_LENGTH: 32,
//     IV_LENGTH: 16,
// } as const;

// // Лимиты и ограничения
// export const LIMITS = {
//     MAX_DOMAIN_LENGTH: 255,
//     MAX_CODE_LENGTH: 255,
//     MAX_GROUP_LENGTH: 255,
//     MAX_TYPE_LENGTH: 255,
//     MAX_STATUS_LENGTH: 255,
//     MAX_APPS_PER_PORTAL: 100,
// } as const;

// // Настройки пагинации
// export const PAGINATION = {
//     DEFAULT_PAGE: 1,
//     DEFAULT_LIMIT: 10,
//     MAX_LIMIT: 100,
// } as const;

// // Коды ошибок базы данных
// export const DATABASE_ERROR_CODES = {
//     UNIQUE_CONSTRAINT: 'P2002',
//     RECORD_NOT_FOUND: 'P2025',
//     FOREIGN_KEY_CONSTRAINT: 'P2003',
//     CONNECTION_ERROR: 'P1001',
// } as const;
