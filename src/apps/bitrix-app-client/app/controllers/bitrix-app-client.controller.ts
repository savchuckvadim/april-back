import { Controller, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitrixAppClientService } from '../services/bitrix-app-client.service';
import { GetBitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { SetSecretDto } from '../dto/set-secret.dto';
import { SuccessResponseDto } from '@/core';
import { BitrixAppDto } from '@/modules/bitrix-setup/install/dto/app.dto';
import { BitrixAppEntity } from '@/modules/bitrix-setup/app/model/bitrix-app.model';

@ApiTags('Bitrix App Client')
@Controller('bitrix-app-client')
export class BitrixAppClientController {
    constructor(private readonly bitrixAppClientService: BitrixAppClientService) { }


    @ApiOperation({ summary: 'Get app' })
    @ApiResponse({ status: 200, description: 'App get', type: BitrixAppEntity })


    @Post('get-app')
    async getApp(@Body() dto: GetBitrixAppDto): Promise<BitrixAppEntity> {
        return await this.bitrixAppClientService.getApp(dto);
    }

    //bx - install

    //set secret
    @Post('set-secret')
    async setSecret(@Body() dto: SetSecretDto) {
        return await this.bitrixAppClientService.setSecret(dto);
    }
}
