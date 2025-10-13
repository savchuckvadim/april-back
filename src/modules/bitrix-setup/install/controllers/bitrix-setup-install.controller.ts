import {
    Controller,
    Post,
    Body,
    Req,
    Res,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BitrixAppDto } from '../dto/app.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto, SuccessResponseDto } from 'src/core';
import { BitrixAppService } from '../../app/services/bitrix-app.service';
import { CreateBitrixAppDto } from '../../app/dto/bitrix-app.dto';
import { BitrixTokenDto } from '../../token/dto/bitrix-token.dto';
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_STATUSES, BITRIX_APP_TYPES } from '../../app/enums/bitrix-app.enum';

@ApiTags('Bitrix Setup Install')
@Controller('bitrix-setup-install')
export class BitrixSetupInstallController {
    constructor(private readonly bitrixAppService: BitrixAppService) { }

    @ApiOperation({ summary: 'Install Bitrix' })
    @ApiResponse({ status: 200, description: 'Bitrix installed', type: SuccessResponseDto })
    @ApiResponse({ status: 400, description: 'Bitrix not installed', type: ErrorResponseDto })
    @Post('install')
    async install(@Req() req: Request, @Res() res: Response) {
        try {
            const body = req.body as Record<string, any>;
            const query = req.query as Record<string, any>;
            const params = {
                ...body,
                ...query,
            };
            // const params = new URLSearchParams(req.body?.toString() || '');
            const event = params?.event;
            const placement = params?.PLACEMENT;
            const domain = req.query['DOMAIN'] as string;
            const applicationToken = req.query['APP_SID'] as string;
            const memberId = params?.member_id;

            let tokenPayload: any = {};
            let install = false;

            if (event === 'ONAPPINSTALL') {
                const auth = JSON.parse(params?.auth || '{}');
                install = !!auth.access_token;
                tokenPayload = {
                    access_token: auth.access_token,
                    refresh_token: auth.refresh_token,
                    expires_in: auth.expires_in,
                    domain,
                    application_token: applicationToken,
                    member_id: memberId,
                };
            } else if (placement === 'DEFAULT') {
                install = !!params?.AUTH_ID;
                tokenPayload = {
                    access_token: params?.AUTH_ID,
                    refresh_token: params?.REFRESH_ID,
                    expires_in: Number(params?.AUTH_EXPIRES),
                    domain,
                    application_token: applicationToken,
                    member_id: memberId,
                };
            }

            let installStatus: 'success' | 'fail' = 'fail';
            if (tokenPayload.access_token && tokenPayload.refresh_token && tokenPayload.domain) {
                installStatus = install ? 'success' : 'fail';

                const expiresAt = new Date(Date.now() + (tokenPayload.expires_in ?? 3600) * 1000)
                    .toISOString();

                const data: CreateBitrixAppDto = {
                    code: BITRIX_APP_CODES.SALES,
                    domain: tokenPayload.domain,
                    group: BITRIX_APP_GROUPS.SALES,
                    status: BITRIX_APP_STATUSES.ACTIVE,
                    type: BITRIX_APP_TYPES.FULL,
                    token: {
                        access_token: tokenPayload.access_token,
                        refresh_token: tokenPayload.refresh_token,
                        expires_at: expiresAt,
                        application_token: tokenPayload.application_token,
                        member_id: tokenPayload.member_id,
                    } as BitrixTokenDto,
                };

               const app = await this.bitrixAppService.storeOrUpdateApp(data);
               if (app) {
                installStatus = 'success';
               }
            }

            const redirectUrl = `https://april-bitrix-main.vercel.app/install?install=${installStatus}`;
            return res.redirect(HttpStatus.FOUND, redirectUrl);
        } catch (error) {
            console.error('[Bitrix Install] error:', error);
            return res.redirect(HttpStatus.FOUND, `https://april-bitrix-main.vercel.app/install?install=fail`);
        }
    }
}
