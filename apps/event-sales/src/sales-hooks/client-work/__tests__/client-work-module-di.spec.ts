import { AppCacheService } from '@lib/app-cache';
import {
    ctorsOf,
    dependenciesOf,
    missingDependencies,
} from '../../../shared/testing/module-di-graph.util';
import { JoinToMainHookModule } from '../../join-to-main/join-to-main.module';
import { MergeDuplicatesHookModule } from '../../merge-duplicates/merge-duplicates.module';
import { ClientWorkModule } from '../client-work.module';

/** AppCacheServiceModule — @Global и импортирован корнем event-sales. */
const GLOBALS = [AppCacheService];

/**
 * DI-граф блока «Открытые сделки по клиенту» и кнопок, куда добавлена проверка прав
 * руководителя: забытый импорт HeadAccessModule уронил бы event-sales на
 * старте (502), а юнит-тесты на моках этого не видят.
 */
describe('DI-граф: «Открытые сделки по клиенту» и проверка прав в кнопках слияния', () => {
    it('ClientWorkModule — все зависимости провайдеров и контроллера доступны', () => {
        expect(missingDependencies(ClientWorkModule, GLOBALS)).toEqual([]);
    });

    it('контроллеры «Присоединить сюда» и «Объединить» получают проверку прав', () => {
        for (const module of [
            JoinToMainHookModule,
            MergeDuplicatesHookModule,
        ]) {
            const controllers = ctorsOf(module, 'controllers');
            expect(missingDependencies(module, GLOBALS, controllers)).toEqual(
                [],
            );
            expect(
                controllers.flatMap(controller =>
                    dependenciesOf(controller).map(dep => dep.name),
                ),
            ).toContain('HeadAccessService');
        }
    });

    it('метаданные конструкторов читаются — проверка выше не пустая', () => {
        expect(
            ctorsOf(ClientWorkModule, 'providers')
                .filter(target => dependenciesOf(target).length > 0)
                .map(target => target.name),
        ).toEqual(expect.arrayContaining(['ClientWorkService']));
    });
});
