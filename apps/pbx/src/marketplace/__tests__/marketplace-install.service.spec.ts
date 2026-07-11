import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { InstallChannel } from '../lib/parse-install-params.util';
import { BitrixAppService } from '@lib/bitrix-setup/app/services/bitrix-app.service';
import {
    BITRIX_APP_CODES,
    BITRIX_APP_GROUPS,
    BITRIX_APP_STATUSES,
    BITRIX_APP_TYPES,
} from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { CreateBitrixAppWithTokenDto } from '@lib/bitrix-setup/app/dto/bitrix-app.dto';
import { BitrixTokenDto } from '@lib/bitrix-setup/token/dto/bitrix-token.dto';

describe('MarketplaceInstallService', () => {
    let service: MarketplaceInstallService;
    let bitrixAppService: jest.Mocked<
        Pick<BitrixAppService, 'storeOrUpdateAppWithToken' | 'getApp'>
    >;

    const onAppInstallBody = {
        event: 'ONAPPINSTALL',
        auth: JSON.stringify({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            application_token: 'app-token',
            domain: 'portal.bitrix24.ru',
            member_id: 'member-1',
        }),
    };

    beforeEach(() => {
        bitrixAppService = {
            storeOrUpdateAppWithToken: jest.fn().mockResolvedValue({
                app: { id: BigInt(7) },
                token: {},
                message: 'ok',
            }),
            getApp: jest
                .fn()
                .mockRejectedValue(new NotFoundException('not found')),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplaceInstallService(
            bitrixAppService as unknown as BitrixAppService,
            configService,
        );
    });

    it('ONAPPINSTALL: сохраняет установку с кодом GARANT и member_id', async () => {
        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('success');
        expect(result.channel).toBe(InstallChannel.EVENT);
        expect(result.appId).toBe('7');
        expect(result.memberId).toBe('member-1');

        const dto = bitrixAppService.storeOrUpdateAppWithToken.mock.calls[0][0];
        expect(dto.code).toBe(BITRIX_APP_CODES.GARANT);
        expect(dto.group).toBe(BITRIX_APP_GROUPS.GENERAL);
        expect(dto.type).toBe(BITRIX_APP_TYPES.FULL);
        expect(dto.status).toBe(BITRIX_APP_STATUSES.ACTIVE);
        expect(dto.token.member_id).toBe('member-1');
        expect(dto.token.application_token).toBe('app-token');
    });

    it('повторная установка: найден существующий app → upsert с его id (без дублей)', async () => {
        bitrixAppService.getApp.mockResolvedValue({
            id: BigInt(42),
        } as Awaited<ReturnType<BitrixAppService['getApp']>>);

        await service.installFromBitrixRequest(onAppInstallBody, undefined);

        expect(bitrixAppService.storeOrUpdateAppWithToken).toHaveBeenCalledWith(
            expect.anything(),
            BigInt(42),
        );
    });

    it('нет токенов → fail без обращения к хранилищу', async () => {
        const result = await service.installFromBitrixRequest(
            { PLACEMENT: 'DEFAULT' },
            { DOMAIN: 'portal.bitrix24.ru' },
        );

        expect(result.status).toBe('fail');
        expect(result.message).toBeDefined();
        expect(
            bitrixAppService.storeOrUpdateAppWithToken,
        ).not.toHaveBeenCalled();
    });

    it('ошибка хранилища → fail с сообщением, исключение не пробрасывается', async () => {
        bitrixAppService.storeOrUpdateAppWithToken.mockRejectedValue(
            new Error('db down'),
        );

        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('fail');
        expect(result.message).toContain('db down');
    });

    it('installFromFront: сохраняет DTO фронта и возвращает канал front', async () => {
        const dto: CreateBitrixAppWithTokenDto = {
            code: BITRIX_APP_CODES.GARANT,
            domain: 'portal.bitrix24.ru',
            group: BITRIX_APP_GROUPS.GENERAL,
            type: BITRIX_APP_TYPES.FULL,
            status: BITRIX_APP_STATUSES.ACTIVE,
            token: {
                access_token: 'at',
                refresh_token: 'rt',
                expires_at: '2026-01-01T00:00:00.000Z',
                application_token: 'app-token',
                member_id: 'member-1',
            } as BitrixTokenDto,
        };

        const result = await service.installFromFront(dto);

        expect(result.status).toBe('success');
        expect(result.channel).toBe(InstallChannel.FRONT);
        expect(result.memberId).toBe('member-1');
    });

    it('redirect-URL по умолчанию — страница установки bitrix.april-app.ru', () => {
        expect(service.installRedirectUrl).toBe(
            'https://bitrix.april-app.ru/install',
        );
    });
});
