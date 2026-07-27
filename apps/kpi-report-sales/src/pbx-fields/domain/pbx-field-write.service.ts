/**
 * Запись значения pbx-поля в Bitrix (crm.deal.update / crm.company.update).
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix и
 * PortalModel из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 *
 * Правила значений:
 *  - enum: принимаем семантический code элемента, в Bitrix пишем numeric
 *    bitrixId элемента (резолв через items поля портала);
 *  - date: принимаем ISO yyyy-MM-dd, в Bitrix пишем DD.MM.YYYY;
 *  - null: очистка поля (пустая строка — Bitrix стирает значение,
 *    никаких legacy-хаков с пробелами).
 */
import { BadRequestException } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    EditablePbxFieldConfig,
    PBX_BITRIX_EMPTY_VALUE,
    PBX_DATETIME_MIDNIGHT_SUFFIX,
    PBX_FIELD_ENTITY,
    PBX_FIELD_VALUE_KIND,
    PBX_ISO_DATE_PATTERN,
    PBX_PORTAL_DATETIME_TYPE,
} from '../constants/pbx-fields.const';

export class PbxFieldWriteService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /**
     * Записывает значение поля; возвращает нормализованное сохранённое
     * значение (code элемента / ISO-дата / null).
     */
    async write(
        config: EditablePbxFieldConfig,
        entityId: number,
        value: string | null,
    ): Promise<string | null> {
        const field = this.resolveField(config);
        const bitrixValue = this.toBitrixValue(config, field, value);
        const fields = { [this.portal.getFieldBitrixId(field)]: bitrixValue };

        if (config.entity === PBX_FIELD_ENTITY.deal) {
            await this.bitrix.deal.update(entityId, fields);
        } else {
            await this.bitrix.company.update(entityId, fields);
        }
        return value ?? null;
    }

    /** Поле портала для сущности конфига; отсутствие — ошибка конфигурации. */
    private resolveField(config: EditablePbxFieldConfig): IField {
        const field =
            config.entity === PBX_FIELD_ENTITY.deal
                ? this.portal.getDealFieldByCode(config.code)
                : this.portal.getCompanyFieldByCode(config.code);
        if (!field || !field.bitrixId) {
            throw new BadRequestException(
                `Поле ${config.code} (${config.entity}) не настроено на портале`,
            );
        }
        return field;
    }

    /** Семантическое значение → значение для crm.*.update. */
    private toBitrixValue(
        config: EditablePbxFieldConfig,
        field: IField,
        value: string | null,
    ): string | number {
        if (value === null || value === undefined || value === '') {
            return PBX_BITRIX_EMPTY_VALUE;
        }
        if (config.valueKind === PBX_FIELD_VALUE_KIND.enum) {
            const item = (field.items ?? []).find(
                fieldItem => fieldItem.code === value,
            );
            if (!item) {
                throw new BadRequestException(
                    `У поля ${config.code} нет элемента с кодом ${value}`,
                );
            }
            return item.bitrixId;
        }
        // date: ISO yyyy-MM-dd → формат ФАКТИЧЕСКОГО типа поля портала:
        // date → DD.MM.YYYY; datetime (на части порталов contract_* —
        // datetime) → DD.MM.YYYY 00:00:00. Отображается всегда только дата.
        if (!PBX_ISO_DATE_PATTERN.test(value)) {
            throw new BadRequestException(
                `Дата поля ${config.code} должна быть в формате yyyy-MM-dd`,
            );
        }
        const [year, month, day] = value.split('-');
        const bitrixDate = `${day}.${month}.${year}`;
        return field.type === PBX_PORTAL_DATETIME_TYPE
            ? `${bitrixDate}${PBX_DATETIME_MIDNIGHT_SUFFIX}`
            : bitrixDate;
    }
}
