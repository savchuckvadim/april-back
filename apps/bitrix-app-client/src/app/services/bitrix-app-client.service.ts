import { Injectable } from '@nestjs/common';
import {
    BitrixAppDto,
    GetBitrixAppDto,
} from '@lib/bitrix-setup/app/dto/bitrix-app.dto';
import { BitrixAppService } from '@lib/bitrix-setup/app/services/bitrix-app.service';
import { BitrixTokenService } from '@lib/bitrix-setup/token/services/bitrix-token.service';
import { BitrixSettingService } from '@lib/bitrix-setup/setting/services/bitrix-setting.service';
import { GetPortalAppsDto } from '../dto/get-app.dto';
import { toBitrixAppDto } from '@lib/bitrix-setup/app/lib/bx-app-dto.mapper';

@Injectable()
export class BitrixAppClientService {
    constructor(
        // private readonly bitrixAppClientService: BitrixAppClientService,
        private readonly bitrixAppService: BitrixAppService,
        private readonly bitrixTokenService: BitrixTokenService,
        private readonly bitrixSettingService: BitrixSettingService,
    ) {}

    async getApp(dto: GetBitrixAppDto) {
        const app = await this.bitrixAppService.getApp(dto);
        return toBitrixAppDto(app);
    }

    // async setSecret(dto: SetSecretDto) {
    //     return await this.bitrixAppService.setSecret(dto.domain, dto.code, {
    //         clientId: dto.clientId,
    //         clientSecret: dto.clientSecret,
    //     });
    // }

    async getPortalApps(dto: GetPortalAppsDto): Promise<BitrixAppDto[]> {
        const apps = await this.bitrixAppService.getAppsByPortalId(
            dto.portalId,
        );
        console.log('getPortalApps dto', dto);
        console.log('getPortalApps apps', apps);
        return apps.map(app => toBitrixAppDto(app));
    }

    //TODO: убрать - for dev
    // async getAllApps(dto: GetPortalAppsDto): Promise<BitrixAppDto[]> {
    //     const apps = await this.bitrixAppService.getAllApps();
    //     return apps.map(app => toBitrixAppDto(app));
    // }
}
