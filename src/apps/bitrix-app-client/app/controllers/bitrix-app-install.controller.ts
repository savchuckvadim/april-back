import {
    Controller,
    Post,
    HttpStatus,
    Req,
    Res,
    Get
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
import { BITRIX_APP_CODES, BITRIX_APP_GROUPS, BITRIX_APP_STATUSES, BITRIX_APP_TYPES, } from '../../../../modules/bitrix-setup/app/enums/bitrix-app.enum';
import { SetAuthCookie } from '@/core/decorators/auth/set-auth-cookie.decorator';
import { ConfigService } from '@nestjs/config';
import { PBXService } from '@/modules/pbx';
import { BxAuthType } from '@/modules/bitrix/bitrix-service.factory';
import { CreateBitrixAppWithTokenDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { BitrixTokenDto } from '@/modules/bitrix-setup/token';
import { getExpiresAt } from '@/lib';


@ApiTags('Bitrix Setup App UI Install')
@Controller('bitrix-app-install')
export class BitrixAppInstallController {
    FRONT_BASE_URL = process.env.CLIENT_CABINET_URL || 'https://';
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly clientService: BitrixClientService,
        private readonly jwtService: JwtService,
        private readonly bitrixAppService: BitrixAppService,
        private readonly configService: ConfigService,
        private readonly pbxService: PBXService,
    ) {
        this.FRONT_BASE_URL = this.configService.get('CLIENT_CABINET_URL') || 'https://';
    }

    @ApiOperation({ summary: 'Sales Manager App for Bitrix' })
    @ApiResponse({ status: 200, description: 'Sales Manager App for Bitrix', type: SuccessResponseDto })
    @ApiResponse({ status: 400, description: 'Sales Manager App for Bitrix not installed', type: ErrorResponseDto })
    @Post('sales-manager')
    @SetAuthCookie()
    async salesManagerInstall(
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

            let installStatus = 'fail';
            let redirectUrl = `${this.FRONT_BASE_URL}/install?install=${installStatus}`;
            const portal = await this.portalService.getPortalByDomain(domain);
            if (portal) {
                // redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}`;

                const clientDta = await this.clientService.findByIdWithOwnerUser(portal?.clientId ?? 0);
                if (clientDta) {
                    const { client, ownerUser } = clientDta;
                    const token = this.jwtService.sign({ sub: ownerUser.id, client_id: client.id });
                    // redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}?token=${token}`;
                    console.log('token sales manager app install', token);
                    let bxApp = await this.bitrixAppService.getApp({
                        domain: domain,
                        code: BITRIX_APP_CODES.SALES,
                    });
                    console.log('bxApp sales manager app install', bxApp);


                    const data: CreateBitrixAppWithTokenDto = {
                        code: BITRIX_APP_CODES.SALES,
                        domain: tokenPayload.domain,
                        group: BITRIX_APP_GROUPS.SALES,
                        status: BITRIX_APP_STATUSES.ACTIVE,
                        type: BITRIX_APP_TYPES.FULL,
                        token: {
                            access_token: tokenPayload.access_token,
                            refresh_token: tokenPayload.refresh_token,
                            expires_at: getExpiresAt(tokenPayload.expires_in),
                            application_token: tokenPayload.application_token,
                            member_id: tokenPayload.member_id,
                        } as BitrixTokenDto,
                    };

                    //todo: отправить в ui на страницу авторизации чтобы из нее  отпрвить метод
                    // в битрикс app install/
                    const app = await this.bitrixAppService.storeOrUpdateAppWithToken(data, bxApp?.id ? BigInt(bxApp.id) : undefined);
                    bxApp = app.app;
                    console.log('app sales manager app install post', app);

                }
            }
            installStatus = 'success';

            const { bitrix } = await this.pbxService.init(domain, BxAuthType.TOKEN);


            redirectUrl = `${this.FRONT_BASE_URL}/install?install=${installStatus}`;
            return res.redirect(HttpStatus.FOUND, redirectUrl);
        } catch (error) {
            console.error('[Bitrix Install] error:', error);
            return res.redirect(HttpStatus.FOUND, `${this.FRONT_BASE_URL}/install?install=fail`);
        }
    }


    @ApiOperation({ summary: 'Sales Manager App for Bitrix' })
    @ApiResponse({ status: 200, description: 'Sales Manager App for Bitrix', type: SuccessResponseDto })
    @ApiResponse({ status: 400, description: 'Sales Manager App for Bitrix not installed', type: ErrorResponseDto })
    @Get('sales-manager')
    @SetAuthCookie()
    async salesManagerAppInstallGet(
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

            let installStatus = 'fail';
            let redirectUrl = `${this.FRONT_BASE_URL}/install?install=${installStatus}`;
            const portal = await this.portalService.getPortalByDomain(domain);
            if (portal) {
                // redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}`;

                const clientDta = await this.clientService.findByIdWithOwnerUser(portal?.clientId ?? 0);
                if (clientDta) {
                    const { client, ownerUser } = clientDta;
                    const token = this.jwtService.sign({ sub: ownerUser.id, client_id: client.id });
                    // redirectUrl = `${this.FRONT_BASE_URL}/standalone/portal/${portal.id}?token=${token}`;
                    console.log('token sales manager app install', token);
                    let bxApp = await this.bitrixAppService.getApp({
                        domain: domain,
                        code: BITRIX_APP_CODES.SALES,
                    });
                    console.log('bxApp sales manager app install', bxApp);


                    const data: CreateBitrixAppWithTokenDto = {
                        code: BITRIX_APP_CODES.SALES,
                        domain: tokenPayload.domain,
                        group: BITRIX_APP_GROUPS.SALES,
                        status: BITRIX_APP_STATUSES.ACTIVE,
                        type: BITRIX_APP_TYPES.FULL,
                        token: {
                            access_token: tokenPayload.access_token,
                            refresh_token: tokenPayload.refresh_token,
                            expires_at: getExpiresAt(tokenPayload.expires_in),
                            application_token: tokenPayload.application_token,
                            member_id: tokenPayload.member_id,
                        } as BitrixTokenDto,
                    };

                    //todo: отправить в ui на страницу авторизации чтобы из нее  отпрвить метод
                    // в битрикс app install/
                    const app = await this.bitrixAppService.storeOrUpdateAppWithToken(data, bxApp?.id ? BigInt(bxApp.id) : undefined);
                    bxApp = app.app;
                    console.log('app sales manager app install get', app);

                }
            }
            installStatus = 'success';
            const { bitrix } = await this.pbxService.init(domain, BxAuthType.TOKEN);
      
            redirectUrl = `${this.FRONT_BASE_URL}/install?install=${installStatus}`;
            return res.redirect(HttpStatus.FOUND, redirectUrl);
        } catch (error) {
            console.error('[Bitrix Install] error:', error);
            return res.redirect(HttpStatus.FOUND, `${this.FRONT_BASE_URL}/install?install=fail`);
        }
    }
}
