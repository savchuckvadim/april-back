import { Injectable } from '@nestjs/common';
import { SetSecretDto } from '../dto/set-secret.dto';
import { GetBitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { BitrixAppService } from '@/modules/bitrix-setup/app/services/bitrix-app.service';
import { BitrixTokenService } from '@/modules/bitrix-setup/token/services/bitrix-token.service';
import { BitrixSettingService } from '@/modules/bitrix-setup/setting/services/bitrix-setting.service';
import { GetPortalAppsDto } from '../dto/get-app.dto';

@Injectable()
export class BitrixAppClientService {
    constructor(
        // private readonly bitrixAppClientService: BitrixAppClientService,
        private readonly bitrixAppService: BitrixAppService,
        private readonly bitrixTokenService: BitrixTokenService,
        private readonly bitrixSettingService: BitrixSettingService,
    ) { }


    async getApp(dto: GetBitrixAppDto) {
        return await this.bitrixAppService.getApp(dto);
    }

    async setSecret(dto: SetSecretDto) {
        return await this.bitrixAppService.setSecret(dto.domain, dto.code, {
            clientId: dto.clientId,
            clientSecret: dto.clientSecret,
        });
    }

    async getPortalApps(dto: GetPortalAppsDto) {
        return await this.bitrixAppService.getAppsByPortalId(dto.portalId);
    }
}
