import {
    Controller,
    Post,
    HttpStatus,
    Req,
    Res
} from '@nestjs/common';
import { BitrixAppService } from '../../../../modules/bitrix-setup/app/services/bitrix-app.service';
import { Request, Response } from 'express';

import {
    ApiTags,
    ApiOperation,
    ApiResponse,

} from '@nestjs/swagger';
import { SuccessResponseDto, ErrorResponseDto } from 'src/core';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { JwtService } from '@nestjs/jwt';
import { BitrixClientService } from '@/apps/bitrix-app-client/client/services/bitrix-client.service';
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_STATUSES, BITRIX_APP_TYPES } from '../../../../modules/bitrix-setup/app/enums/bitrix-app.enum';
import { SetAuthCookie } from '@/core/decorators/auth/set-auth-cookie.decorator';
import { ConfigService } from '@nestjs/config';


@ApiTags('Bitrix Setup App UI')
@Controller('bitrix-app-ui')
export class BitrixAppUiController {
    FRONT_BASE_URL = process.env.CLIENT_CABINET_URL || 'https://';
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly clientService: BitrixClientService,
        private readonly jwtService: JwtService,
        private readonly bitrixAppService: BitrixAppService,
        private readonly configService: ConfigService,
    ) {
        this.FRONT_BASE_URL = this.configService.get('CLIENT_CABINET_URL') || 'https://';
    }

    @ApiOperation({ summary: 'Sales Manager App for Bitrix' })
    @ApiResponse({ status: 200, description: 'Sales Manager App for Bitrix', type: SuccessResponseDto })
    @ApiResponse({ status: 400, description: 'Sales Manager App for Bitrix not installed', type: ErrorResponseDto })
    @Post('sales-manager')
    @SetAuthCookie()
    async salesManagerApp(
        @Req() req: Request, @Res() res: Response
    ) {
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


            let redirectUrl = `${this.FRONT_BASE_URL}/standalone`;
            const portal = await this.portalService.getPortalByDomain(domain);
            if (portal) {
                redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}`;

                const clientDta = await this.clientService.findByIdWithOwnerUser(portal?.clientId ?? 0);
                if (clientDta) {
                    const { client, ownerUser } = clientDta;
                    const token = this.jwtService.sign({ sub: ownerUser.id, client_id: client.id });
                    redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}?token=${token}`;

                    const bxApp = await this.bitrixAppService.getApp({
                        domain: domain,
                        code: BITRIX_APP_CODES.SALES,
                    });
                    if (bxApp) {
                        redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}/app/${bxApp.id}`;
                    }
                }
            }
            return res.redirect(HttpStatus.FOUND, redirectUrl);
        } catch (error) {
            console.error('[Bitrix Install] error:', error);
            return res.redirect(HttpStatus.FOUND, `${this.FRONT_BASE_URL}/install?install=fail`);
        }
    }
}
