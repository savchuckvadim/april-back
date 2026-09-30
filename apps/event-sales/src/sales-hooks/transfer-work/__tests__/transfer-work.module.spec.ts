import { TransferWorkHookModule } from '../transfer-work.module';
import { TransferWorkUseCase } from '../use-cases/transfer-work.use-case';
import { UserNameResolver } from '../../../shared/lead-request/user-name.resolver';

/**
 * Проводка модуля: юнит-тесты собирают use-case вручную и не видят ошибок
 * внедрения — без провайдера резолвера приложение упало бы на старте
 * (UnknownDependenciesException), а тесты остались бы зелёными.
 */
describe('TransferWorkHookModule — проводка', () => {
    it('use-case и резолвер имён объявлены провайдерами', () => {
        const providers =
            (Reflect.getMetadata('providers', TransferWorkHookModule) as
                | unknown[]
                | undefined) ?? [];

        expect(providers).toContain(TransferWorkUseCase);
        expect(providers).toContain(UserNameResolver);
    });
});
