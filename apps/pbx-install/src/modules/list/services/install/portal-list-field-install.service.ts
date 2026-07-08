import { Injectable } from '@nestjs/common';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    PbxFieldEntity,
    PbxFieldItemEntity,
    PbxFieldService,
} from '@lib/portal-lib/pbx-domain';
import {
    IBxListFieldRef,
    IBxListInstalledFieldResult,
} from './bx-list-fields-install.service';
import {
    ListFieldCodeKey,
    fullListFieldCode,
} from '../../lib/list-field-code.util';

/** Результат установки поля списка с гарантированно найденным bxField */
export interface IPbxListFieldInstallData extends IBxListInstalledFieldResult {
    bxField: IBxListFieldRef;
}

/**
 * Зеркалирование полей универсального списка в PortalDB (`bitrixfields`).
 *
 * Отличия от PortalEntityFieldInstallService (UF-поля):
 * - entity_type всегда BITRIX_LIST, entity_id — id строки `bitrixlists`;
 * - code и bitrixId — полный легаси-код `${group}_${type}_${code}`
 *   (по нему `portal.model.getIdByCodeFieldList` ищет поле);
 * - bitrixCamelId — FIELD_ID (PROPERTY_N) без camel-преобразования: именно
 *   его легаси-потребители передают в lists.element.add / lists.field.get;
 * - items enum-полей берутся из DISPLAY_VALUES_FORM ({id: value}).
 */
@Injectable()
export class PortalListFieldInstallService {
    constructor(private readonly pbxFieldService: PbxFieldService) {}

    async syncWithDb(
        listDbId: number,
        listKey: ListFieldCodeKey,
        fields: IPbxListFieldInstallData[],
    ): Promise<PbxFieldEntity[]> {
        const pbxFieldEntities = fields.map(field =>
            this.getPbxFieldEntity(field, listDbId, listKey),
        );
        return await this.pbxFieldService.upsertFields(pbxFieldEntities);
    }

    private getPbxFieldEntity(
        field: IPbxListFieldInstallData,
        listDbId: number,
        listKey: ListFieldCodeKey,
    ): PbxFieldEntity {
        const fullCode = fullListFieldCode(listKey, field.parsedField.code);
        const entity = new PbxFieldEntity();
        entity.entity_type = PbxEntityTypePrisma.BITRIX_LIST;
        entity.parent_type = field.parsedField.appType;
        entity.entity_id = listDbId;
        entity.name = field.parsedField.name;
        entity.title = field.parsedField.name;
        entity.code = fullCode;
        entity.type = field.parsedField.type;
        entity.isPlural = field.parsedField.isMultiple;
        entity.bitrixId = fullCode;
        entity.bitrixCamelId = field.bxField.fieldId;
        entity.items =
            field.parsedField.type === 'enumeration'
                ? this.getItems(field)
                : [];
        return entity;
    }

    private getItems(field: IPbxListFieldInstallData): PbxFieldItemEntity[] {
        const values = field.bxField.description.DISPLAY_VALUES_FORM ?? {};
        const items: PbxFieldItemEntity[] = [];
        for (const [id, value] of Object.entries(values)) {
            // code берём из шаблона по соответствию VALUE; значения Bitrix
            // вне шаблона в БД не зеркалим (у них нет кода конфигурации)
            const parsedItem = field.parsedField.list.find(
                i => this.alnumOnly(i.VALUE) === this.alnumOnly(value),
            );
            if (!parsedItem) {
                continue;
            }
            const item = new PbxFieldItemEntity();
            item.name = value;
            item.title = value;
            item.code = parsedItem.CODE;
            item.bitrixId = Number(id);
            items.push(item);
        }
        return items;
    }

    /** Нормализация строки для сравнения (как в abstract-инсталлере) */
    private alnumOnly(value: string | undefined): string {
        if (!value) {
            return '';
        }
        return value
            .normalize('NFD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, '');
    }
}
