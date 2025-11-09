import { Controller, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientRegistrationRequestDto } from '../dto/client-registration.dto';
import { SuccessResponseDto } from '@/core';
import { BitrixClientService } from '../services/bitrix-client.service';

@ApiTags('Bitrix App Client')
@Controller('bitrix-client')
export class BitrixClientController {
    constructor(
        private readonly bitrixClientService: BitrixClientService
    ) { }


    @ApiOperation({ summary: 'Registration new client' })
    @ApiResponse({
        status: 200, description: 'App get', type: SuccessResponseDto, schema: {
            allOf: [
                { $ref: '#/components/schemas/SuccessResponseDto' },
                {
                    properties: { data: { $ref: '#/components/schemas/BitrixAppDto' } }
                }
            ]
        }
    })

    @ApiOperation({ summary: 'Get app' })
    @ApiResponse({
        status: 200, description: 'App get', type: SuccessResponseDto, schema: {
            allOf: [
                { $ref: '#/components/schemas/SuccessResponseDto' },
                {
                    properties: { data: { $ref: '#/components/schemas/BitrixAppDto' } }
                }
            ]
        }
    })
    @Post('registration')
    async getApp(@Body() dto: ClientRegistrationRequestDto) {

        return await this.bitrixClientService.registrationClient(dto);
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
