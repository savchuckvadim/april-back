import { Controller, Post, Query, Body, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitrixAppClientService } from '../services/bitrix-app-client.service';
import {
    BitrixAppDto,
    CreateBitrixAppDto,
    GetBitrixAppDto,
} from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { GetPortalAppsDto } from '../dto/get-app.dto';
import { BitrixAppService } from '@/modules/bitrix-setup/app/services/bitrix-app.service';
import { EnabledAppDto } from '@/modules/bitrix-setup/app/dto/enaled-app.dto';
import { CreateAppResponseDto } from '../dto/create-app-response.dto';

@ApiTags('Bitrix App Client App')
@Controller('bitrix-app-client')
export class BitrixAppClientController {
    constructor(
        private readonly bitrixAppClientService: BitrixAppClientService,
        private readonly bitrixAppService: BitrixAppService,
    ) {}

    @ApiOperation({ summary: 'Get app' })
    @ApiResponse({ status: 200, description: 'App get', type: BitrixAppDto })
    @Post('get-app')
    async getApp(@Body() dto: GetBitrixAppDto): Promise<BitrixAppDto> {
        return await this.bitrixAppClientService.getApp(dto);
    }

    //bx - install

    // //set secret
    // @Post('set-secret')
    // async setSecret(@Body() dto: SetSecretDto) {
    //     return await this.bitrixAppClientService.setSecret(dto);
    // }

    @ApiOperation({ summary: 'Get portal apps' })
    @ApiResponse({
        status: 200,
        description: 'Portal apps get. Отдает приложения привязанные к порталу',
        type: [BitrixAppDto],
    })
    @Get('get-portal-apps')
    async getPortalApps(
        @Query() dto: GetPortalAppsDto,
    ): Promise<BitrixAppDto[]> {
        return await this.bitrixAppClientService.getPortalApps(dto);
    }

    @ApiOperation({ summary: 'Get enabled apps' })
    @ApiResponse({
        status: 200,
        description: ' Отдает доступные для установки приложения',
        type: [EnabledAppDto],
    })
    @Get('enabled-apps')
    getEnabledApps() {
        return this.bitrixAppService.getEnabledApps();
    }

    @ApiOperation({ summary: 'Create app' })
    @ApiResponse({
        status: 200,
        description: 'App created',
        type: CreateAppResponseDto,
    })
    @Post('create-app')
    async createApp(
        @Body() dto: CreateBitrixAppDto,
    ): Promise<CreateAppResponseDto> {
        console.log('createApp dto', dto);
        const result = await this.bitrixAppService.storeOrUpdateApp(dto);
        return new CreateAppResponseDto({
            app: result.app,
            secrets: result.secrets ?? null,
            message: result.message,
        });
    }
}
