import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalRqService } from '@lib/portal-lib/pbx-domain/portal-rq';
import type { RqPresetTemplate } from '@/apps/rq/install';
import { RqPresetSyncResultDto } from '../dto/rq-response.dto';
import { matchBitrixPreset } from '../utils/rq-preset-match.util';

/**
 * Установка/синхронизация пресета реквизита (`crm.requisite.preset.*`) +
 * зеркало в PortalDB (`bx_rqs`) через {@link PortalRqService}.
 *
 * Инстанс Bitrix не держим в `this` (race condition между доменами) — он
 * приходит аргументом из use-case, который взял его из `PBXService.init(domain)`.
 * «Чужие» пресеты портала не трогаем (нет orphan-чистки).
 */
@Injectable()
export class InstallRqPresetSyncService {
    private readonly logger = new Logger(InstallRqPresetSyncService.name);

    constructor(private readonly portalRqService: PortalRqService) {}

    async syncPreset(
        bitrix: BitrixService,
        portalId: number,
        tpl: RqPresetTemplate,
    ): Promise<RqPresetSyncResultDto> {
        const list = await bitrix.requisitePreset.getList({});
        const presets = list.result ?? [];

        // Привязка из bx_rqs (в т.ч. ручная) участвует в матчинге первой.
        const dbRow = await this.portalRqService.findByCodePortalOrNull(
            portalId,
            tpl.code,
        );
        const dbBitrixId =
            dbRow?.bitrixId != null ? Number(dbRow.bitrixId) : null;

        const match = matchBitrixPreset(presets, tpl, dbBitrixId);

        const fields = {
            ENTITY_TYPE_ID: tpl.entityTypeId,
            COUNTRY_ID: tpl.countryId,
            NAME: tpl.name,
            XML_ID: tpl.xmlId,
            ACTIVE: 'Y',
            SORT: tpl.sort,
        };

        let bitrixId: number;
        let created: boolean;
        if (match) {
            // Adopt: берём существующий пресет (в т.ч. системный 1/3/5),
            // а не создаём дубль. Отказ Bitrix обновить системный пресет
            // не валит синхронизацию — привязка в БД важнее.
            bitrixId = Number(match.preset.ID);
            created = false;
            try {
                await bitrix.requisitePreset.update(bitrixId, fields);
            } catch (e) {
                this.logger.warn(
                    `RQ preset ${tpl.code}: update of adopted bitrixId=${bitrixId} failed, keeping binding: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        } else {
            const addRes = await bitrix.requisitePreset.add(fields);
            bitrixId = Number(addRes.result);
            created = true;
        }

        this.logger.log(
            `RQ preset ${tpl.code} (${tpl.xmlId}) ${created ? 'created' : `adopted by ${match!.rule}`} bitrixId=${bitrixId}`,
        );

        const portalResult = await this.portalRqService.upsertByCodePortal(
            portalId,
            tpl.code,
            {
                name: tpl.name,
                type: tpl.type,
                bitrixId,
                xmlId: tpl.xmlId,
                entityTypeId: tpl.entityTypeId,
                countryId: String(tpl.countryId),
                isActive: true,
                sort: tpl.sort,
            },
        );

        return {
            code: tpl.code,
            xmlId: tpl.xmlId,
            bitrixId,
            created,
            portalResult,
        };
    }
}
