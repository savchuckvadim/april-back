import { Test } from '@nestjs/testing';
import { AuthTokenService } from '../../services/auth-token.service';
import { PortalSessionController } from '../portal-session.controller';
import { PortalSessionGuard } from '../portal-session.guard';
import {
    PortalSessionApiModule,
    PortalSessionModule,
} from '../portal-session.module';
import { PortalSessionService } from '../portal-session.service';

/**
 * DI-граф модулей сессии закрывается сам: сервисная половина отдаёт
 * сервис и guard (и через AuthModule.forIssuer — AuthTokenService для
 * guard'а в модулях-потребителях), API-половина поднимает контроллер.
 */
describe('DI-граф PortalSessionModule / PortalSessionApiModule', () => {
    it('сервисная половина: сервис, guard и AuthTokenService доступны', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [PortalSessionModule],
        }).compile();

        expect(moduleRef.get(PortalSessionService)).toBeInstanceOf(
            PortalSessionService,
        );
        expect(moduleRef.get(PortalSessionGuard)).toBeInstanceOf(
            PortalSessionGuard,
        );
        expect(moduleRef.get(AuthTokenService)).toBeInstanceOf(
            AuthTokenService,
        );
        await moduleRef.close();
    });

    it('API-половина: контроллер собирается поверх сервисной', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [PortalSessionApiModule],
        }).compile();

        expect(moduleRef.get(PortalSessionController)).toBeInstanceOf(
            PortalSessionController,
        );
        await moduleRef.close();
    });
});
