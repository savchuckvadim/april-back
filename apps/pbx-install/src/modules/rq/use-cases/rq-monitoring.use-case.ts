import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalRqService } from '@lib/portal-lib/pbx-domain/portal-rq';
import { RQ_FIELD_TEMPLATE, RQ_PRESET_TEMPLATE } from '@/apps/rq/install';
import {
    RqFieldMonitorRowDto,
    RqMonitoringResponseDto,
    RqParseResponseDto,
    RqPresetMonitorRowDto,
} from '../dto/rq-response.dto';

/**
 * Чтение текущего состояния реквизитной части: смерженный вид Bitrix
 * (`preset.list` + `userfield.list`) × PortalDB (`bx_rqs`) × эталон.
 */
@Injectable()
export class RqMonitoringUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRqService: PortalRqService,
    ) {}

    /** Предпросмотр эталона (что будет установлено). */
    parse(): RqParseResponseDto {
        return { presets: RQ_PRESET_TEMPLATE, fields: RQ_FIELD_TEMPLATE };
    }

    async monitoring(domain: string): Promise<RqMonitoringResponseDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        const { bitrix } = await this.pbxService.init(domain);

        const bxPresets =
            (await bitrix.requisitePreset.getList({})).result ?? [];
        const bxFields =
            (await bitrix.requisite.getFieldsList({})).result ?? [];
        const dbPresets = await this.portalRqService.findByPortalId(portalId);

        const presets: RqPresetMonitorRowDto[] = RQ_PRESET_TEMPLATE.map(tpl => {
            const db = dbPresets.find(d => d.code === tpl.code);
            const dbBitrixId =
                db?.bitrixId != null ? Number(db.bitrixId) : null;
            // Сопоставляем с Bitrix по XML_ID, а если пресет создан не нашим
            // установщиком (пустой/другой XML_ID) — по сохранённому в `bx_rqs`
            // bitrix_id. Иначе уже установленный пресет ложно показывался как
            // отсутствующий в Bitrix.
            const bx =
                bxPresets.find(p => p.XML_ID === tpl.xmlId) ??
                (dbBitrixId != null
                    ? bxPresets.find(p => Number(p.ID) === dbBitrixId)
                    : undefined);
            const bitrixId = bx ? Number(bx.ID) : null;
            return {
                code: tpl.code,
                name: tpl.name,
                xmlId: tpl.xmlId,
                inBitrix: !!bx,
                bitrixId,
                inDb: !!db,
                dbBitrixId,
                inSync: bitrixId != null && dbBitrixId != null && bitrixId === dbBitrixId,
            };
        });

        const fields: RqFieldMonitorRowDto[] = RQ_FIELD_TEMPLATE.map(tpl => {
            const bx = bxFields.find(f => f.XML_ID === tpl.xmlId);
            return {
                xmlId: tpl.xmlId,
                label: tpl.label,
                inBitrix: !!bx,
                fieldId: bx ? Number(bx.ID) : null,
                fieldName: bx?.FIELD_NAME ?? null,
            };
        });

        return { domain, portalId, presets, fields };
    }
}
