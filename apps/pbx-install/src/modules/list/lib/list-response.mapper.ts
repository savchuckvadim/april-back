import { PbxFieldEntity, PortalListEntity } from '@lib/portal-lib/pbx-domain';
import { IBxListFieldsInstallResult } from '../services/install/bx-list-fields-install.service';
import {
    ListFieldsInstallResultDto,
    ListKeyDto,
    PortalListDto,
    PortalListFieldDto,
} from '../dto/list-response.dto';

/** Пустой результат установки полей (нечего ставить). */
export function emptyFieldsInstallResult(
    list: ListKeyDto,
    message: string,
): ListFieldsInstallResultDto {
    return {
        list,
        countTotal: 0,
        countSuccess: 0,
        countFailed: 0,
        errorCodes: [],
        fields: [],
        dbSyncedCount: 0,
        message,
    };
}

/** Bx-результат установки полей → типизированный DTO ответа. */
export function toFieldsInstallResultDto(
    list: ListKeyDto,
    bxResult: IBxListFieldsInstallResult,
    dbSyncedCount: number,
): ListFieldsInstallResultDto {
    return {
        list,
        countTotal: bxResult.countTotal,
        countSuccess: bxResult.countSuccess,
        countFailed: bxResult.countFailed,
        errorCodes: bxResult.errorCodes,
        fields: bxResult.results.map(r => ({
            code: r.code,
            name: r.parsedField.name,
            bxFieldName: r.parsedField.bxFieldName,
            fieldId: r.bxField?.fieldId ?? null,
            ok: r.bxField !== undefined,
        })),
        dbSyncedCount,
    };
}

/** Поле списка из PortalDB → типизированный DTO ответа. */
export function toPortalListFieldDto(
    field: PbxFieldEntity,
): PortalListFieldDto {
    return {
        id: field.id ?? null,
        name: field.name,
        code: field.code,
        type: String(field.type),
        isPlural: field.isPlural,
        bitrixId: field.bitrixId,
        bitrixCamelId: field.bitrixCamelId,
        items: (field.items ?? []).map(item => ({
            name: item.name,
            code: item.code,
            bitrixId: item.bitrixId,
        })),
    };
}

/** Entity списка из PortalDB → типизированный DTO ответа. */
export function toPortalListDto(entity: PortalListEntity): PortalListDto {
    return {
        id: entity.id,
        portalId: entity.portalId,
        type: entity.type,
        group: entity.group,
        name: entity.name,
        title: entity.title,
        bitrixId: entity.bitrixId,
        code: entity.code,
        fields: entity.fields.map(toPortalListFieldDto),
    };
}
