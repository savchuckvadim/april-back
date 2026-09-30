import { LeadAcceptHookModule } from '../lead-accept.module';
import { LeadAcceptUseCase } from '../use-cases/lead-accept.use-case';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';

/**
 * Проводка модуля: юнит-тесты собирают use-case вручную и не видят ошибок
 * внедрения — без провайдера резолвера приложение упало бы на старте
 * (UnknownDependenciesException), а тесты остались бы зелёными.
 */
describe('LeadAcceptHookModule — проводка', () => {
    it('use-case и резолвер имён объявлены провайдерами', () => {
        const providers =
            (Reflect.getMetadata('providers', LeadAcceptHookModule) as
                | unknown[]
                | undefined) ?? [];

        expect(providers).toContain(LeadAcceptUseCase);
        expect(providers).toContain(UserNameResolver);
    });
});
