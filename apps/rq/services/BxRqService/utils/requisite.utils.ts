import { PresetId } from '@/apps/rq/enums/preset-id.enum';

import { PresetConfig } from '../consts/preset.consts';
import { BXRequisiteDTO } from '@/apps/rq/types/bx-requisite-dto.type';
import { CustomField } from '@/apps/rq/types/bx-custom-field.type';
import { NameUtil, WordUtil } from '@lib/shared';

/**
 * Утилиты для работы с реквизитами
 */

/**
 * Фильтрует поля реквизита, убирая пустые значения
 */
export const filterRequisiteFields = (
    requisite: BXRequisiteDTO,
): Record<string, unknown> => {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(requisite)) {
        if (value !== null && value !== undefined && value !== '') {
            fields[key] = value;
        }
    }
    return fields;
};

/**
 * Добавляет поля из customFields в объект полей
 */
export const mergeCustomFields = (
    fields: Record<string, unknown>,
    customFields?: CustomField[],
): Record<string, unknown> => {
    if (!customFields) return fields;

    for (const customField of customFields) {
        if (customField.value) {
            fields[customField.FIELD_NAME] = customField.value;
        }
    }
    return fields;
};

/**
 * Применяет значения customFields к реквизиту
 */
export const applyCustomFieldsToRequisite = (
    requisite: BXRequisiteDTO,
): void => {
    if (!requisite.customFields) return;

    for (const custom of requisite.customFields) {
        const customXmlId = custom.XML_ID?.trim() || '';
        if (!customXmlId || !custom.value) {
            continue;
        }

        switch (customXmlId) {
            case 'position_case':
                requisite.RQ_POSITION_CASE = custom.value;
                break;
            case 'position':
                requisite.RQ_POSITION = custom.value;
                break;
            case 'based':
                requisite.RQ_BASED = custom.value;
                break;
            case 'based_case':
                requisite.RQ_BASED_CASE = custom.value;
                break;
            case 'director_case':
                requisite.RQ_DIRECTOR_CASE = custom.value;
                break;
            case 'base_other':
                requisite.RQ_BASE_OTHER = custom.value;
                break;
        }
    }
};

/**
 * Устанавливает имя реквизита, если оно отсутствует
 */
export const setRequisiteNameIfEmpty = (requisite: BXRequisiteDTO): void => {
    if (!requisite.NAME) {
        requisite.NAME = [
            requisite.RQ_LAST_NAME,
            requisite.RQ_FIRST_NAME,
            requisite.RQ_SECOND_NAME,
        ]
            .filter(Boolean)
            .join(' ')
            .trim();
    }
};

/**
 * Обрабатывает реквизит организации
 */
export const processOrganizationRequisite = (
    requisite: BXRequisiteDTO,
    preset: PresetConfig,
): void => {
    if (requisite.PRESET_ID !== preset.org) return;

    if (requisite.RQ_DIRECTOR && !requisite.RQ_DIRECTOR_CASE?.trim()) {
        requisite.RQ_DIRECTOR_CASE = NameUtil.declineWord(
            requisite.RQ_DIRECTOR,
        );
    }

    if (requisite.RQ_POSITION && !requisite.RQ_POSITION_CASE?.trim()) {
        requisite.RQ_POSITION_CASE = WordUtil.declineWord(
            requisite.RQ_POSITION,
        );
    }

    if (requisite.RQ_COMPANY_NAME && !requisite.RQ_COMPANY_NAME.trim()) {
        requisite.RQ_COMPANY_NAME = requisite.RQ_COMPANY_FULL_NAME;
    }
};

/**
 * Обрабатывает реквизит физического лица
 */
export const processPhysicalPersonRequisite = (
    requisite: BXRequisiteDTO,
    preset: PresetConfig,
): void => {
    if (requisite.PRESET_ID !== preset.fiz) return;

    if (!requisite.RQ_NAME) {
        try {
            requisite.RQ_NAME =
                (requisite.RQ_LAST_NAME + ' ' || '') +
                (requisite.RQ_FIRST_NAME + ' ' || '') +
                (requisite.RQ_SECOND_NAME + ' ' || '');
        } catch {
            // Ignore
        }
    }
};

/**
 * Обрабатывает реквизит без пресета
 */
export const processRequisiteWithoutPreset = (
    requisite: BXRequisiteDTO,
): void => {
    if (!requisite.RQ_DIRECTOR_CASE) {
        // TODO: Implement decline_word function
        // requisite.RQ_DIRECTOR_CASE = `${declineWord(requisite.RQ_LAST_NAME)} ${declineWord(requisite.RQ_FIRST_NAME)} ${declineWord(requisite.RQ_SECOND_NAME)}`;
    }
};

/**
 * Проверяет наличие реквизита с указанным PRESET_ID
 */
export const hasRequisiteWithPresetId = (
    requisites: BXRequisiteDTO[],
    presetId: number,
): boolean => {
    return requisites.some(item => item.PRESET_ID === presetId);
};

/**
 * Создает пустой реквизит с указанным PRESET_ID
 */
export const createEmptyRequisite = (
    companyId: number,
    presetId: number,
): BXRequisiteDTO => {
    return new BXRequisiteDTO({
        ID: -1,
        ENTITY_ID: companyId,
        ENTITY_TYPE_ID: 4,
        PRESET_ID: presetId,
    });
};

/**
 * Добавляет недостающие пресеты реквизитов
 */
export const addMissingPresets = (
    requisites: BXRequisiteDTO[],
    companyId: number,
    preset: PresetConfig,
): void => {
    try {
        if (!hasRequisiteWithPresetId(requisites, preset.org)) {
            requisites.push(createEmptyRequisite(companyId, preset.org));
        }
        if (!hasRequisiteWithPresetId(requisites, preset.ip)) {
            requisites.push(createEmptyRequisite(companyId, preset.ip));
        }
        if (!hasRequisiteWithPresetId(requisites, preset.fiz)) {
            requisites.push(createEmptyRequisite(companyId, preset.fiz));
        }
    } catch {
        // Ignore
    }
};

/**
 * Обновляет PRESET_ID реквизитов на основе пресетов
 */
export const updatePresetIds = (
    requisites: BXRequisiteDTO[],
    preset: PresetConfig,
): void => {
    for (const rq of requisites) {
        if (rq.PRESET_ID === PresetId.ORG) {
            rq.PRESET_ID = preset.org;
        } else if (rq.PRESET_ID === PresetId.IP) {
            rq.PRESET_ID = preset.ip;
        } else if (rq.PRESET_ID === PresetId.FIZ) {
            rq.PRESET_ID = preset.fiz;
        }
    }
};
