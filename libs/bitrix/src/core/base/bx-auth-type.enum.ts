/**
 * Протокол авторизации запросов к Bitrix.
 * Вынесен в отдельный модуль (а не в bitrix-service.factory),
 * чтобы низкоуровневые core-сервисы не создавали циклический импорт
 * на фабрику (bitrix-service.factory → api.factory → bitrix-service.factory).
 */
export enum BxAuthType {
    TOKEN = 'token',
    HOOK = 'hook',
}
