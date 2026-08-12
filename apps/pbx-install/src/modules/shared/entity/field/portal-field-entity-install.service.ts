import { Injectable, Logger } from '@nestjs/common';
import {
    getPrismaEntityTypeByType,
    PbxEntityType,
    PbxEntityTypePrisma,
} from '@/shared/enums';

import {
    PbxFieldEntity,
    PbxFieldItemEntity,
    PbxFieldService,
} from '@lib/portal-lib/pbx-domain';
import { PortalOnlineCacheService } from '@lib/portal-lib/store/portal-online-cache.service';
import { getCamelBxFieldIdCase } from '../../utils/get-camel-case-bx-field.util';
import { IBXField } from '@/modules/bitrix';
import { Field } from '../../parse-field-excel/type/parse-field.type';
export interface IPbxFieldInstallData {
    code: string;
    result: number | boolean;
    parsedField: Field;
    bxField: IBXField;
}

@Injectable()
export class PortalEntityFieldInstallService {
    private readonly logger = new Logger(PortalEntityFieldInstallService.name);

    constructor(
        private readonly pbxFieldService: PbxFieldService,
        private readonly onlineCache: PortalOnlineCacheService,
    ) {}

    /**
     * Зеркалит установленные поля в PortalDB.
     *
     * `domain` НУЖЕН обязательно: слепок портала лежит в Redis-кэше
     * `portal_{domain}` с TTL 10 часов, и без сброса боевые приложения
     * (event-sales и др.) не увидят новые поля до истечения TTL — поля
     * молча остаются «неустановленными», а хуки их скипают (graceful).
     * Домен не передан — только предупреждение, установка не падает.
     */
    async syncWithDb(
        entityType: PbxEntityType,
        entityId: number,
        fields: IPbxFieldInstallData[],
        domain?: string,
    ): Promise<PbxFieldEntity[]> {
        //получаем entity type нужный для записи в db
        const prismaEntityType = getPrismaEntityTypeByType(entityType);

        // собираем pbxFieldEntities для записи в db
        const pbxFieldEntities: PbxFieldEntity[] = fields.map(field =>
            this.getPbxFieldEntity(field, prismaEntityType, entityId),
        );
        // записываем pbxFieldEntities в db - добавляем либо удаляем
        const saved = await this.pbxFieldService.upsertFields(pbxFieldEntities);

        if (domain) {
            await this.onlineCache.invalidate(domain);
            this.logger.log(
                `Поля ${entityType} синхронизированы (${saved.length}) — кэш portal_${domain} сброшен`,
            );
        } else {
            this.logger.warn(
                `Поля ${entityType} синхронизированы без домена — кэш портала НЕ сброшен, приложения увидят изменения только через 10 ч`,
            );
        }
        return saved;
    }

    private getPbxFieldEntity(
        field: IPbxFieldInstallData,
        entityType: PbxEntityTypePrisma,
        entityId: number,
    ): PbxFieldEntity {
        console.log('getPbxFieldEntity field', field);
        const pbxFieldEntity = new PbxFieldEntity();
        pbxFieldEntity.entity_type = entityType;
        pbxFieldEntity.parent_type = field.parsedField.appType;
        pbxFieldEntity.entity_id = entityId;
        pbxFieldEntity.name = field.parsedField.name;
        pbxFieldEntity.title = field.parsedField.name;
        pbxFieldEntity.code = field.parsedField.code;
        pbxFieldEntity.type = field.parsedField.type;
        // Зеркалим фактическое состояние Bitrix (как в PortalFieldTypedEntityInstallService):
        // MULTIPLE у существующего поля через update не меняется, поэтому источник — bxField.
        pbxFieldEntity.isPlural = field.bxField.MULTIPLE === 'Y';
        pbxFieldEntity.bitrixId = field.parsedField.bxFieldName.toString();
        pbxFieldEntity.bitrixCamelId = getCamelBxFieldIdCase(
            field.bxField.FIELD_NAME,
        );
        if (
            field.parsedField.type === 'enumeration' &&
            field.bxField.LIST &&
            field.parsedField.list.length > 0
        ) {
            pbxFieldEntity.items = this.getPbxFieldItemEntity(field);
        }
        return pbxFieldEntity;
    }
    private getPbxFieldItemEntity(
        field: IPbxFieldInstallData,
    ): PbxFieldItemEntity[] {
        if (
            field.parsedField.type === 'enumeration' &&
            field.bxField?.LIST &&
            field.parsedField.list.length > 0
        ) {
            const list = field.bxField.LIST?.map(item => {
                if (!item.ID) {
                    return null;
                }
                const pbxFieldItemEntity = new PbxFieldItemEntity();
                pbxFieldItemEntity.name = item.VALUE;
                pbxFieldItemEntity.title = item.VALUE;
                // code берём из шаблона (parsedField.list), а не из bx XML_ID:
                // у ранее созданных в Bitrix элементов XML_ID может быть авто-хэшем,
                // и в БД должен попасть человекочитаемый CODE из excel.
                pbxFieldItemEntity.code =
                    this.resolveItemCode(field, item) ||
                    item.XML_ID?.toString() ||
                    '';
                pbxFieldItemEntity.bitrixId = Number(item.ID);
                return pbxFieldItemEntity;
            });
            return list.filter(item => item !== null);
        }
        return [];
    }

    /**
     * Находит код элемента списка из шаблона (excel) по соответствию с элементом
     * Bitrix — сначала по XML_ID, затем по отображаемому названию (VALUE).
     * Возвращает undefined, если соответствия в шаблоне нет.
     */
    private resolveItemCode(
        field: IPbxFieldInstallData,
        bxItem: { VALUE?: string; XML_ID?: string },
    ): string | undefined {
        const parsedItem = field.parsedField.list?.find(
            i =>
                this.alnumOnly(i.XML_ID) === this.alnumOnly(bxItem.XML_ID) ||
                this.alnumOnly(i.VALUE) === this.alnumOnly(bxItem.VALUE),
        );
        return parsedItem?.CODE;
    }

    /** Нормализация строки для сравнения: только буквы/цифры любого алфавита, lower-case. */
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
