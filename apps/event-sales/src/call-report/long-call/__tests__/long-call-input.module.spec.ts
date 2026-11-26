import 'reflect-metadata';
import { CallReportModule } from '../../call-report.module';
import { LongCallInputService } from '../long-call-input.service';

/**
 * Сервис длинного разговора зарегистрирован в модуле разбора звонков.
 * Доступность его зависимостей проверяет общий тест DI-графа модуля
 * (call-report-module-di.spec.ts).
 */
describe('LongCallInputService в модулях', () => {
    it('зарегистрирован в провайдерах CallReportModule', () => {
        const providers = Reflect.getMetadata(
            'providers',
            CallReportModule,
        ) as unknown[];

        expect(providers).toContain(LongCallInputService);
    });
});
