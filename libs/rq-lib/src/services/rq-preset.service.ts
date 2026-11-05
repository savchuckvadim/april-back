import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { IBitrixResponse } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PresetCode } from '../enums/preset-code.enum';
import { RQ_PRESET_TEMPLATE } from '../install/rq-preset.template';
import { RqPresetTemplate } from '../install/rq-install.types';
import { PresetConfig } from './BxRqService/consts/preset.consts';

/** Пресет реквизита одного типа на конкретном портале. */
export interface RqPreset {
    id: number;
    name: string;
}

/** Пресеты портала по типам клиента. */
export interface RqPresetSet {
    org: RqPreset;
    ip: RqPreset;
    fiz: RqPreset;
}

export type RqPresetKind = keyof RqPresetSet;

/** Пресет из `crm.requisite.preset.list` — Bitrix отдаёт числа строками. */
interface BxPresetRow {
    ID: number | string;
    NAME?: string | null;
    XML_ID?: string | null;
    ENTITY_TYPE_ID?: number | string | null;
    COUNTRY_ID?: number | string | null;
}

const KIND_BY_CODE: Record<PresetCode, RqPresetKind> = {
    [PresetCode.ORG]: 'org',
    [PresetCode.IP]: 'ip',
    [PresetCode.FIZ]: 'fiz',
};

const TEMPLATE_BY_KIND: Record<RqPresetKind, RqPresetTemplate> = {
    org: RQ_PRESET_TEMPLATE.find(tpl => tpl.type === 'org')!,
    ip: RQ_PRESET_TEMPLATE.find(tpl => tpl.type === 'ip')!,
    fiz: RQ_PRESET_TEMPLATE.find(tpl => tpl.type === 'fiz')!,
};

export const presetConfigOf = (presets: RqPresetSet): PresetConfig => ({
    org: presets.org.id,
    ip: presets.ip.id,
    fiz: presets.fiz.id,
});

/** Тип клиента по id пресета портала; чужой пресет — null. */
export const presetKindOf = (
    presets: RqPresetSet,
    presetId: number | string | null | undefined,
): RqPresetKind | null => {
    const id = Number(presetId);
    if (!id) return null;
    if (id === presets.org.id) return 'org';
    if (id === presets.ip.id) return 'ip';
    if (id === presets.fiz.id) return 'fiz';
    return null;
};

/**
 * Пресеты реквизитов портала. Id пресетов на каждом портале свои, источник
 * истины — `bx_rqs` (заполняет установка pbx-install). Если портал не
 * зеркалирован в БД, тот же эталон ищется среди пресетов Bitrix по XML_ID,
 * затем по имени; хардкода 1/3/5 нет: на april-garant это 2/4/6.
 */
@Injectable()
export class RqPresetService {
    private readonly logger = new Logger(RqPresetService.name);

    async resolve(
        bitrix: BitrixService,
        portalModel: PortalModel,
    ): Promise<RqPresetSet> {
        const fromDb = this.fromPortal(portalModel);
        const missing = (Object.keys(TEMPLATE_BY_KIND) as RqPresetKind[]).filter(
            kind => !fromDb[kind],
        );
        if (missing.length === 0) {
            return fromDb as RqPresetSet;
        }

        const rows = await this.listBitrixPresets(bitrix);
        const resolved: Partial<RqPresetSet> = { ...fromDb };
        for (const kind of missing) {
            const found = this.matchTemplate(rows, TEMPLATE_BY_KIND[kind]);
            if (found) {
                resolved[kind] = found;
                this.logger.warn(
                    `Пресет ${kind} не зеркалирован в bx_rqs, взят из Bitrix: #${found.id} «${found.name}»`,
                );
            }
        }

        const stillMissing = missing.filter(kind => !resolved[kind]);
        if (stillMissing.length > 0) {
            throw new BadRequestException(
                `На портале не найдены пресеты реквизитов: ${stillMissing.join(', ')}. Нужна установка реквизитов (pbx-install).`,
            );
        }
        return resolved as RqPresetSet;
    }

    private fromPortal(portalModel: PortalModel): Partial<RqPresetSet> {
        const result: Partial<RqPresetSet> = {};
        for (const code of Object.values(PresetCode)) {
            const preset = portalModel.getPresetForName(code);
            const id = Number(preset?.bitrix_id);
            if (preset && id > 0) {
                result[KIND_BY_CODE[code]] = {
                    id,
                    name: preset.name || TEMPLATE_BY_KIND[KIND_BY_CODE[code]].name,
                };
            }
        }
        return result;
    }

    private async listBitrixPresets(bitrix: BitrixService): Promise<BxPresetRow[]> {
        const response = (await bitrix.api.call('crm.requisite.preset.list', {
            filter: { ENTITY_TYPE_ID: TEMPLATE_BY_KIND.org.entityTypeId },
            start: -1,
        })) as IBitrixResponse<BxPresetRow[]>;
        return Array.isArray(response?.result) ? response.result : [];
    }

    /** Те же правила, что у установки: XML_ID, затем имя в своём разрезе. */
    private matchTemplate(
        rows: BxPresetRow[],
        tpl: RqPresetTemplate,
    ): RqPreset | null {
        const byXmlId = rows.find(row => row.XML_ID === tpl.xmlId);
        if (byXmlId) return this.toPreset(byXmlId, tpl);

        const sameName = rows.filter(
            row =>
                Number(row.ENTITY_TYPE_ID) === tpl.entityTypeId &&
                Number(row.COUNTRY_ID) === tpl.countryId &&
                String(row.NAME ?? '').trim() === tpl.name.trim(),
        );
        if (sameName.length === 0) return null;
        const byName =
            sameName.find(row => Number(row.ID) === tpl.defaultBitrixId) ??
            sameName.reduce((min, row) =>
                Number(row.ID) < Number(min.ID) ? row : min,
            );
        return this.toPreset(byName, tpl);
    }

    private toPreset(row: BxPresetRow, tpl: RqPresetTemplate): RqPreset {
        return { id: Number(row.ID), name: String(row.NAME ?? tpl.name) };
    }
}
