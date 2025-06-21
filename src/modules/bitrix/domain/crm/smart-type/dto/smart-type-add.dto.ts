import { BitrixOwnerTypeId } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";
import { IBXSmartType } from "../interface/smart-type.interface";

// Интерфейс для одной связи relation
export interface IBXSmartTypeRelation {
    entityTypeId: BitrixOwnerTypeId; // Идентификатор системного или пользовательского типа сущности CRM
    isChildrenListEnabled?: string; // Добавлять ли связанный элемент в карточку ("true" или "false")
}

// Интерфейс для связей relations
export interface IBXSmartTypeRelations {
    parent?: IBXSmartTypeRelation[]; // Элементы CRM, которые будут привязаны к данному смарт-процессу
    child?: IBXSmartTypeRelation[]; // Элементы CRM, к котором будет привязан данный смарт-процесс
}

// Интерфейс для привязки к пользовательским полям
export interface IBXSmartTypeLinkedUserFields {
    [key: string]: string; // Динамические ключи типа "CALENDAR_EVENT|UF_CRM_CAL_EVENT": "true"
}

// Интерфейс для полей смарт-процесса
export interface IBXSmartTypeFields {
    // Обязательные поля
    title: string; // Название смарт-процесса *
    
    // Опциональные поля
    entityTypeId?: number; // Идентификатор создаваемого смарт-процесса
    relations?: IBXSmartTypeRelations; // Объект, содержащий связи к другим сущностям CRM
    
    // Флаги включения функций (используют "Y" | "N" как в API)
    isUseInUserfieldEnabled?: "Y" | "N"; // Включено ли использование смарт-процесса в пользовательском поле
    linkedUserFields?: IBXSmartTypeLinkedUserFields; // Набор пользовательских полей
    isAutomationEnabled?: "Y" | "N"; // Включены ли роботы и триггеры
    isBeginCloseDatesEnabled?: "Y" | "N"; // Включены ли поля Дата начала и Дата завершения
    isBizProcEnabled?: "Y" | "N"; // Включено ли использование дизайнера бизнес процессов
    isCategoriesEnabled?: "Y" | "N"; // Включены ли свои воронки и туннели продаж
    isClientEnabled?: "Y" | "N"; // Включено ли поле Клиент
    isDocumentsEnabled?: "Y" | "N"; // Включена ли печать документов
    isLinkWithProductsEnabled?: "Y" | "N"; // Включена ли привязка товаров каталога
    isMycompanyEnabled?: "Y" | "N"; // Включено ли поле Реквизиты вашей компании
    isObserversEnabled?: "Y" | "N"; // Включено ли поле Наблюдатели
    isRecyclebinEnabled?: "Y" | "N"; // Включено ли использование корзины
    isSetOpenPermissions?: "Y" | "N"; // Делать ли новые воронки доступными для всех
    isSourceEnabled?: "Y" | "N"; // Включены ли поля Источник и Дополнительно об источнике
    isStagesEnabled?: "Y" | "N"; // Включено ли использование своих стадий и канбана
    
    // Устаревшие поля (для обратной совместимости)
    isExternal?: "Y" | "N"; // Является ли смарт-процесс вынесенным из CRM
    customSectionId?: number; // Идентификатор цифрового рабочего места
    customSections?: any[]; // Массив цифровых рабочих мест
}

// Основной DTO для добавления смарт-процесса
export class SmartTypeAddRequestDto {
    fields: IBXSmartTypeFields;
}

export class SmartTypeResponseDto {
    type: IBXSmartType;
}
export class SmartTypeListResponseDto {
    types: IBXSmartType[];
}
export class SmartTypeUpdateRequestDto extends SmartTypeAddRequestDto {
    id: number;
 
}



