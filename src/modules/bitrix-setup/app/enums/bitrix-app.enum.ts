// Константы для модуля Bitrix Setup App

export enum BITRIX_APP_TYPES {
    WEBHOOK = 'webhook',
    EVENT = 'event',
    KONSTRUCTOR = 'konstructor',
    REPORT = 'report',
    MANAGMENT = 'managment',
    AI = 'ai',
    OTHER = 'other',
    FULL = 'full',
}

export enum BITRIX_APP_STATUSES {
    // активный, неактивный, в процессе установки, в процессе обновления, ошибка
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    PENDING = 'pending', // в процессе установки
    SUSPENDED = 'suspended', // в процессе обновления
    DEBT = 'debt', // задолженность
    ERROR = 'error',
}

export enum BITRIX_APP_GROUPS {
    SALES = 'sales',
    SERVICE = 'service',
    GENERAL = 'general',
    NPP = 'npp',
    MANAGMENT = 'managment',
    AI = 'ai',
    OTHER = 'other',
}
export enum BITRIX_APP_CODES {
    SALES = 'sales_full',
    SERVICE = 'service_full',


}

export enum API_ENDPOINTS {
    STORE_OR_UPDATE = 'store-or-update',
    GET = 'get',
    ALL = 'all',
    GET_BY_PORTAL = 'get-by-portal',
    UPDATE = ':id',
    DELETE = ':id',
}

export enum HTTP_STATUS_CODES {
    OK = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    INTERNAL_SERVER_ERROR = 500,
};

export enum ERROR_MESSAGES {
    APP_NOT_FOUND = 'Bitrix App not found',
    APPS_NOT_FOUND = 'Bitrix Apps not found',
    APP_FAILED = 'Bitrix App failed',
    VALIDATION_FAILED = 'Validation failed',
    PORTAL_NOT_FOUND = 'Portal not found',
    DATABASE_ERROR = 'Database connection error',
}

export enum SUCCESS_MESSAGES {
    APP_CREATED = 'App created successfully',
    APP_UPDATED = 'App updated successfully',
    APP_DELETED = 'App deleted successfully',
    APP_SAVED = 'Bitrix App saved',
}

// Типы для TypeScript
export type BitrixAppType = typeof BITRIX_APP_TYPES[keyof typeof BITRIX_APP_TYPES];
export type BitrixAppStatus = typeof BITRIX_APP_STATUSES[keyof typeof BITRIX_APP_STATUSES];
export type BitrixAppGroup = typeof BITRIX_APP_GROUPS[keyof typeof BITRIX_APP_GROUPS];

// Валидационные массивы
export const VALID_APP_TYPES = Object.values(BITRIX_APP_TYPES);
export const VALID_APP_STATUSES = Object.values(BITRIX_APP_STATUSES);
export const VALID_APP_GROUPS = Object.values(BITRIX_APP_GROUPS);

// Конфигурация шифрования
export enum ENCRYPTION_CONFIG {
    ALGORITHM = 'aes-256-cbc',
    SALT = 'salt',
    KEY_LENGTH = 32,
    IV_LENGTH = 16,
}

// Лимиты и ограничения
export enum LIMITS {
    MAX_DOMAIN_LENGTH = 255,
    MAX_CODE_LENGTH = 255,
    MAX_GROUP_LENGTH = 255,
    MAX_TYPE_LENGTH = 255,
    MAX_STATUS_LENGTH = 255,
    MAX_APPS_PER_PORTAL = 100,
}
