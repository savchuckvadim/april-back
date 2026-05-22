import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto, SuccessResponseDto } from 'src/core';
import { BitrixAppService } from '../../app/services/bitrix-app.service';
import { CreateBitrixAppWithTokenDto } from '../../app/dto/bitrix-app.dto';
import { BitrixTokenDto } from '../../token/dto/bitrix-token.dto';
import {
    BITRIX_APP_CODES,
    BITRIX_APP_GROUPS,
    BITRIX_APP_STATUSES,
    BITRIX_APP_TYPES,
} from '../../app/enums/bitrix-app.enum';

type BitrixInstallRequestSource = Record<string, unknown> | undefined;

interface BitrixInstallParams {
    event?: string;
    PLACEMENT?: string;
    DOMAIN?: string;
    APP_SID?: string;
    member_id?: string;
    auth?: string;
    AUTH_ID?: string;
    REFRESH_ID?: string;
    AUTH_EXPIRES?: string;
}

interface BitrixInstallAuthPayload {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
}

interface BitrixInstallTokenPayload {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    domain?: string;
    application_token?: string;
    member_id?: string;
}

function getStringValue(
    source: BitrixInstallRequestSource,
    key: string,
): string | undefined {
    const value = source?.[key];
    return typeof value === 'string' ? value : undefined;
}

function collectInstallParams(
    body: BitrixInstallRequestSource,
    query: BitrixInstallRequestSource,
): BitrixInstallParams {
    return {
        event: getStringValue(body, 'event') ?? getStringValue(query, 'event'),
        PLACEMENT:
            getStringValue(body, 'PLACEMENT') ??
            getStringValue(query, 'PLACEMENT'),
        DOMAIN:
            getStringValue(body, 'DOMAIN') ?? getStringValue(query, 'DOMAIN'),
        APP_SID:
            getStringValue(body, 'APP_SID') ?? getStringValue(query, 'APP_SID'),
        member_id:
            getStringValue(body, 'member_id') ??
            getStringValue(query, 'member_id'),
        auth: getStringValue(body, 'auth') ?? getStringValue(query, 'auth'),
        AUTH_ID:
            getStringValue(body, 'AUTH_ID') ?? getStringValue(query, 'AUTH_ID'),
        REFRESH_ID:
            getStringValue(body, 'REFRESH_ID') ??
            getStringValue(query, 'REFRESH_ID'),
        AUTH_EXPIRES:
            getStringValue(body, 'AUTH_EXPIRES') ??
            getStringValue(query, 'AUTH_EXPIRES'),
    };
}

function parseExpiresIn(value?: string | number): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function parseInstallAuthPayload(raw?: string): BitrixInstallAuthPayload {
    if (!raw) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        const auth = parsed as Record<string, unknown>;

        return {
            access_token:
                typeof auth.access_token === 'string'
                    ? auth.access_token
                    : undefined,
            refresh_token:
                typeof auth.refresh_token === 'string'
                    ? auth.refresh_token
                    : undefined,
            expires_in: parseExpiresIn(
                typeof auth.expires_in === 'string' ||
                    typeof auth.expires_in === 'number'
                    ? auth.expires_in
                    : undefined,
            ),
        };
    } catch {
        return {};
    }
}

@ApiTags('Bitrix Setup Install')
@Controller('bitrix-setup-install')
export class BitrixSetupInstallController {
    constructor(private readonly bitrixAppService: BitrixAppService) {}

    @ApiOperation({ summary: 'Install Bitrix' })
    @ApiResponse({
        status: 200,
        description: 'Bitrix installed',
        type: SuccessResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Bitrix not installed',
        type: ErrorResponseDto,
    })
    @Post('install')
    async install(@Req() req: Request, @Res() res: Response) {
        try {
            const body =
                req.body && typeof req.body === 'object'
                    ? (req.body as Record<string, unknown>)
                    : undefined;
            const query =
                req.query && typeof req.query === 'object'
                    ? (req.query as Record<string, unknown>)
                    : undefined;
            const params = collectInstallParams(body, query);
            const event = params.event;
            const placement = params.PLACEMENT;
            const domain = params.DOMAIN;
            const applicationToken = params.APP_SID;
            const memberId = params.member_id;

            let tokenPayload: BitrixInstallTokenPayload = {};
            let install = false;

            if (event === 'ONAPPINSTALL') {
                const auth = parseInstallAuthPayload(params.auth);
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
                install = !!params.AUTH_ID;
                tokenPayload = {
                    access_token: params.AUTH_ID,
                    refresh_token: params.REFRESH_ID,
                    expires_in: parseExpiresIn(params.AUTH_EXPIRES),
                    domain,
                    application_token: applicationToken,
                    member_id: memberId,
                };
            }

            let installStatus: 'success' | 'fail' = 'fail';
            if (
                tokenPayload?.access_token &&
                tokenPayload?.refresh_token &&
                tokenPayload?.domain
            ) {
                installStatus = install ? 'success' : 'fail';

                const expiresAt = new Date(
                    Date.now() + (tokenPayload.expires_in ?? 3600) * 1000,
                ).toISOString();

                const data: CreateBitrixAppWithTokenDto = {
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

                //todo: отправить в ui на страницу авторизации чтобы из нее  отпрвить метод
                // в битрикс app install/
                const app =
                    await this.bitrixAppService.storeOrUpdateAppWithToken(data);
                if (app) {
                    installStatus = 'success';
                }
            }

            const redirectUrl = `https://april-bitrix-main.vercel.app/install?install=${installStatus}`;
            return res.redirect(HttpStatus.FOUND, redirectUrl);
        } catch (error) {
            console.error('[Bitrix Install] error:', error);
            return res.redirect(
                HttpStatus.FOUND,
                `https://april-bitrix-main.vercel.app/install?install=fail`,
            );
        }
    }
}
