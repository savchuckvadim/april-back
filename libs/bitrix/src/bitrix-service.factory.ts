import { Inject, Injectable, Optional } from '@nestjs/common';
import { BitrixService } from './bitrix.service';
import { BitrixApiFactoryService } from './core/queue/bitrix-api.factory.service';

import { ServiceClonerFactory } from './domain/service-clone.factory';
import { BitrixCredentials } from './core/interface/bitrix-credentials.interface';
import {
    BITRIX_TOKEN_PROVIDER,
    IBitrixTokenProvider,
} from './auth/bitrix-token-provider.port';
import { BxAuthType } from './core/base/bx-auth-type.enum';

// Ре-экспорт для обратной совместимости со старыми импортами
// `import { BxAuthType } from '.../bitrix-service.factory'`.
export { BxAuthType };

@Injectable()
export class BitrixServiceFactory {
    constructor(
        private readonly bitrixApiFactoryService: BitrixApiFactoryService,
        private readonly cloner: ServiceClonerFactory,
        // Поставщик токена нужен только для авторизации по TOKEN.
        // В HOOK-сценарии может отсутствовать — поэтому @Optional().
        @Optional()
        @Inject(BITRIX_TOKEN_PROVIDER)
        private readonly tokenProvider?: IBitrixTokenProvider,
    ) {}

    public async create(
        credentials: BitrixCredentials,
        authType: BxAuthType = BxAuthType.HOOK,
    ): Promise<BitrixService> {
        const token =
            authType === BxAuthType.TOKEN
                ? await this.resolveToken(credentials)
                : undefined;

        const bitrixApi = this.bitrixApiFactoryService.create(
            credentials,
            authType,
            token,
        );

        const instance = new BitrixService(bitrixApi, this.cloner);

        instance.init(credentials.domain);
        return instance;
    }

    private async resolveToken(
        credentials: BitrixCredentials,
    ): Promise<string> {
        if (credentials.accessToken) {
            return credentials.accessToken;
        }
        if (!this.tokenProvider) {
            throw new Error(
                'BitrixServiceFactory: для авторизации по TOKEN не сконфигурирован IBitrixTokenProvider (BITRIX_TOKEN_PROVIDER)',
            );
        }
        return this.tokenProvider.getFreshToken(credentials.domain);
    }
}
