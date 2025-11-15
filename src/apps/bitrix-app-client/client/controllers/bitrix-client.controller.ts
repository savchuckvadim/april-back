import { Controller, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SuccessResponseDto } from '@/core';

import { GetClientPortalsRequestDto } from '../dto/get-client-portals.dto';
import { Portal } from 'generated/prisma';
import { BitrixClientPortalService } from '../services/bitrix-client-portal.service';

@ApiTags('Bitrix App Client Client')
@Controller('bitrix-client')
export class BitrixClientController {
    constructor(
        private readonly bitrixClientPortalService: BitrixClientPortalService
    ) { }



    @ApiOperation({ summary: 'Get client portals', description: 'Get client portals by client id' })
    @ApiBody({ type: GetClientPortalsRequestDto })
    @ApiResponse({
        status: 200, description: 'Client portals get', type: SuccessResponseDto<Portal[]>
    })
    @Post('get-client-portals')
    async getClientPortals(@Body() dto: GetClientPortalsRequestDto): Promise<{ id: number, domain: string }[] | null> {
        return await this.bitrixClientPortalService.getClientPortals(dto);
    }




}
