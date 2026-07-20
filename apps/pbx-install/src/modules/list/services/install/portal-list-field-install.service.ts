import { Injectable, Logger } from '@nestjs/common';
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

/**
 * Значение `parent_type` для зеркал полей списков — легаси-контракт:
 * Laravel `Bitrixlist::fields()` фильтрует morphMany по `parent_type = 'list'`.
 */
export const LIST_FIELD_PARENT_TYPE = 'list';

/** Результат установки поля списка с гарантированно найденным bxField */
export interface IPbxListFieldInstallData extends IBxListInstalledFieldResult {
    bxField: IBxListFieldRef;
}

/**
 * Зеркалирование полей универсального списка в PortalDB (`bitrixfields`).
 *
 * Отличия от PortalEntityFieldInstallService (UF-поля):
 * - entity_type всегда BITRIX_LIST, entity_id — id строки `bitrixlists`;
 * - code — полный легаси-код `${group}_${type}_${code}`
 *   (по нему `portal.model.getIdByCodeFieldList` ищет поле);
 * - bitrixId — числовой ID свойства (`PROPERTY_213` → `213`), как писал
 *   Laravel-инсталлер; потребители читают его как число;
 * - bitrixCamelId — FIELD_ID (PROPERTY_N) без camel-преобразования: именно
 *   его легаси-потребители передают в lists.element.add / lists.field.get;
 * - items enum-полей берутся из DISPLAY_VALUES_FORM ({id: value}).
 */
@Injectable()
export class PortalListFieldInstallService {
    private readonly logger = new Logger(PortalListFieldInstallService.name);

    constructor(private readonly pbxFieldService: PbxFieldService) {}

    async syncWithDb(
        listDbId: number,
        listKey: ListFieldCodeKey,
        fields: IPbxListFieldInstallData[],
    ): Promise<PbxFieldEntity[]> {
        await this.cleanupStaleMirrors(listDbId, listKey, fields);

        const pbxFieldEntities = fields.map(field =>
            this.getPbxFieldEntity(field, listDbId, listKey),
        );
        const result =
            await this.pbxFieldService.upsertFields(pbxFieldEntities);
        this.logger.log(
            `syncWithDb list=${listKey.group}_${listKey.type} (id=${listDbId}): ` +
                `upserted ${result.length}/${fields.length} fields ` +
                `[${result.map(f => f.code).join(', ')}]`,
        );
        return result;
    }

    /**
     * Чистка устаревших зеркал этого списка: ранняя версия установщика писала
     * `code` коротким (`event_date`) или btx-кодом (`EVENT_DATE`) — upsert по
     * новому полному коду создал бы вторую запись, а мусорная осталась бы.
     * Удаляем только записи, чей code совпадает с коротким/btx-кодом полей
     * шаблона (легаси-записи с полными кодами не трогаем).
     */
    private async cleanupStaleMirrors(
        listDbId: number,
        listKey: ListFieldCodeKey,
        fields: IPbxListFieldInstallData[],
    ): Promise<void> {
        const existing = await this.pbxFieldService.findByEntityId(
            PbxEntityTypePrisma.BITRIX_LIST,
            BigInt(listDbId),
        );
        if (existing.length === 0) {
            return;
        }
        const staleCodes = new Set(
            fields.flatMap(f => [
                f.parsedField.code,
                f.parsedField.bxFieldName,
            ]),
        );
        const fullCodes = new Set(
            fields.map(f => fullListFieldCode(listKey, f.parsedField.code)),
        );
        const stale = existing.filter(
            e =>
                e.id !== undefined &&
                !fullCodes.has(e.code) &&
                staleCodes.has(e.code),
        );
        if (stale.length === 0) {
            return;
        }
        await this.pbxFieldService.deleteFieldsByIds(
            stale.map(e => BigInt(e.id as string)),
        );
        this.logger.log(
            `syncWithDb list=${listKey.group}_${listKey.type} (id=${listDbId}): ` +
                `removed ${stale.length} stale mirrors ` +
                `[${stale.map(e => e.code).join(', ')}]`,
        );
    }

    private getPbxFieldEntity(
        field: IPbxListFieldInstallData,
        listDbId: number,
        listKey: ListFieldCodeKey,
    ): PbxFieldEntity {
        const fullCode = fullListFieldCode(listKey, field.parsedField.code);
        const entity = new PbxFieldEntity();
        entity.entity_type = PbxEntityTypePrisma.BITRIX_LIST;
        // строго 'list': Laravel Bitrixlist::fields() и portal-builder
        // (mapBitrixList) отбирают поля через where('parent_type', 'list');
        // appType из шаблона ('calling'/'kpi') сюда писать нельзя
        entity.parent_type = LIST_FIELD_PARENT_TYPE;
        entity.entity_id = listDbId;
        entity.name = field.parsedField.name;
        entity.title = field.parsedField.name;
        entity.code = fullCode;
        entity.type = field.parsedField.type;
        entity.isPlural = field.parsedField.isMultiple;
        entity.bitrixId = field.bxField.fieldId.replace(/^PROPERTY_/i, '');
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
