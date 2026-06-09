import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    RQ_FIELD_TEMPLATE,
    RQ_PRESET_TEMPLATE,
    RqFieldTemplate,
    RqPresetTemplate,
} from '@/apps/rq/install';
import { InstallRqPresetSyncService } from '../services/install-rq-preset-sync.service';
import { InstallRqFieldSyncService } from '../services/install-rq-field-sync.service';
import {
    InstallRqResultDto,
    RqFieldSyncResultDto,
    RqPresetSyncResultDto,
} from '../dto/rq-response.dto';

/**
 * Установка реквизитной части портала из эталона (TS-консты):
 * пресеты `crm.requisite.preset.*` (+ зеркало в `bx_rqs`) и
 * пользовательские поля `crm.requisite.userfield.*`.
 */
@Injectable()
export class InstallRqUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly presetSync: InstallRqPresetSyncService,
        private readonly fieldSync: InstallRqFieldSyncService,
    ) {}

    /** Полная установка эталона (пресеты + поля). */
    async installAll(domain: string): Promise<InstallRqResultDto> {
        return this.install(domain, RQ_PRESET_TEMPLATE, RQ_FIELD_TEMPLATE);
    }

    /** Установка только переданных пресетов. */
    async installPresets(
        domain: string,
        presets: RqPresetTemplate[],
    ): Promise<InstallRqResultDto> {
        return this.install(domain, presets, []);
    }

    /** Установка только переданных полей. */
    async installFields(
        domain: string,
        fields: RqFieldTemplate[],
    ): Promise<InstallRqResultDto> {
        return this.install(domain, [], fields);
    }

    private async install(
        domain: string,
        presets: RqPresetTemplate[],
        fields: RqFieldTemplate[],
    ): Promise<InstallRqResultDto> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        // локальный инстанс битрикса по domain — НЕ держим в this
        const { bitrix } = await this.pbxService.init(domain);

        const presetResults: RqPresetSyncResultDto[] = [];
        for (const tpl of presets) {
            presetResults.push(
                await this.presetSync.syncPreset(bitrix, portalId, tpl),
            );
        }

        const fieldResults: RqFieldSyncResultDto[] = [];
        for (const tpl of fields) {
            if (!tpl.isNeedUpdate) continue;
            fieldResults.push(await this.fieldSync.syncField(bitrix, tpl));
        }

        return {
            domain,
            portalId,
            presets: presetResults,
            fields: fieldResults,
        };
    }
}
