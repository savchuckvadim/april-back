import { Controller, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientRegistrationRequestDto } from '../dto/client-registration.dto';
import { SuccessResponseDto } from '@/core';
import { BitrixClientService } from '../services/bitrix-client.service';
import { AuthGuard } from '../../auth/guard/jwt-auth.guard';
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
    async getClientPortals(@Body() dto: GetClientPortalsRequestDto): Promise<Portal[]> {
        return await this.bitrixClientPortalService.getClientPortals(dto);
    }



    // login
    // emailConfirmation
    // changeStatus
    // updateRegistrationData
    // logout
    // addNewUser
    // addPortal
    // deletePortal
    // deleteUser
    // deleteClient
    // deleteAllData

}
