import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { PresetConfig } from '../consts/preset.consts';
import { BXRequisiteDTO } from '@lib/rq-lib/types/bx-requisite-dto.type';
import { CustomField } from '@lib/rq-lib/types/bx-custom-field.type';
import { NameUtil, WordUtil } from '@lib/shared';
import type { RqPreset, RqPresetSet } from '../../rq-preset.service';
import { isPreset } from './preset.utils';

/** Id заготовки реквизита: ещё не создан в Bitrix. */
export const TEMPLATE_RQ_ID = -1;

/**
 * Поля реквизита для записи в Bitrix: без пустых значений.
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
 * Значения пользовательских полей (UF_CRM_*) к полям записи.
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
 * Пользовательские поля по XML_ID → именованные атрибуты реквизита.
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
 * Имя реквизита по ФИО, если Bitrix его не хранит.
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
 * Организация: падежи директора и должности, краткое имя из полного.
 */
export const processOrganizationRequisite = (
    requisite: BXRequisiteDTO,
    preset: PresetConfig,
): void => {
    if (!isPreset(requisite.PRESET_ID, preset.org)) return;

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
 * Физлицо: ФИО одной строкой.
 */
export const processPhysicalPersonRequisite = (
    requisite: BXRequisiteDTO,
    preset: PresetConfig,
): void => {
    if (!isPreset(requisite.PRESET_ID, preset.fiz)) return;

    if (!requisite.RQ_NAME) {
        requisite.RQ_NAME = [
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
 * Заготовка реквизита типа: id -1, пресет и имя пресета портала, владелец —
 * компания. В Bitrix не пишется, пока менеджер не сохранит поля.
 */
export const createTemplateRequisite = (
    companyId: number,
    preset: RqPreset,
): BXRequisiteDTO =>
    new BXRequisiteDTO({
        ID: TEMPLATE_RQ_ID,
        ENTITY_ID: companyId,
        ENTITY_TYPE_ID: BitrixOwnerTypeId.COMPANY,
        PRESET_ID: preset.id,
        NAME: preset.name,
    });

/**
 * По заготовке на каждый тип клиента, независимо от того, есть ли у компании
 * реквизиты этого типа: из неё создаётся новый реквизит.
 */
export const addTemplates = (
    requisites: BXRequisiteDTO[],
    companyId: number,
    presets: RqPresetSet,
): void => {
    requisites.push(
        createTemplateRequisite(companyId, presets.org),
        createTemplateRequisite(companyId, presets.ip),
        createTemplateRequisite(companyId, presets.fiz),
    );
};
