import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { XoDispatchRescueModule } from '../xo-dispatch-rescue.module';
import { XoDispatchRescueScheduler } from '../xo-dispatch-rescue.scheduler';
import { XoDispatchRescueService } from '../xo-dispatch-rescue.service';
import { LeadRequestModule } from '../../../lead-request/lead-request.module';
import { RejectReviveHookModule } from '../../../sales-hooks/reject-revive/reject-revive.module';

/**
 * Проводка модуля, а не логика.
 *
 * ЗАЧЕМ ЭТОТ ФАЙЛ. Юнит-тесты собирают сервисы вручную (`new Service(...)`)
 * и потому НЕ ВИДЯТ ошибок внедрения зависимостей: модуль без нужного
 * импорта проходит все тесты зелёным, а приложение падает на старте
 * (UnknownDependenciesException) и уходит в краш-луп. Так уже было
 * 26.08.2026 с реанимацией отказников и повторилось 13.09.2026 здесь:
 * планировщик требовал RedisService и PortalAppSettingsService, а модуль
 * их модули не импортировал.
 *
 * Полная сборка контейнера в тесте не годится: она тянет Prisma, Redis и
 * ClickHouse, которых в CI нет. Поэтому проверяем то, что реально сломалось
 * — метаданные модуля: объявлены ли импорты, без которых провайдеры не
 * соберутся.
 */
const importsOf = (moduleClass: object): unknown[] =>
    (Reflect.getMetadata('imports', moduleClass) as unknown[] | undefined) ??
    [];

const providersOf = (moduleClass: object): unknown[] =>
    (Reflect.getMetadata('providers', moduleClass) as unknown[] | undefined) ??
    [];

describe('XoDispatchRescueModule — проводка', () => {
    it('планировщик и сервис объявлены провайдерами', () => {
        const providers = providersOf(XoDispatchRescueModule);

        expect(providers).toContain(XoDispatchRescueScheduler);
        expect(providers).toContain(XoDispatchRescueService);
    });

    /*
     * Redis-лок держит планировщик, настройки он же и читает. Оба модуля
     * НЕ глобальные — без явного импорта приложение не поднимается.
     */
    it('импортирует RedisModule — иначе Redis-лок не соберётся', () => {
        expect(importsOf(XoDispatchRescueModule)).toContain(RedisModule);
    });

    it('импортирует PortalAppSettingsModule — иначе настройки не прочитать', () => {
        expect(importsOf(XoDispatchRescueModule)).toContain(
            PortalAppSettingsModule,
        );
    });

    it('импортирует PBXModule — его требует чтение календаря портала', () => {
        expect(importsOf(XoDispatchRescueModule)).toContain(PBXModule);
    });
});

describe('Модули с кронами: обязательные импорты на месте', () => {
    /*
     * Каждый планировщик event-sales держит Redis-лок и читает настройки
     * портала. Проверяем разом все модули, где такие планировщики живут —
     * чтобы следующий добавленный крон не уронил прод тем же способом.
     */
    it.each([
        ['XoDispatchRescueModule', XoDispatchRescueModule],
        ['LeadRequestModule', LeadRequestModule],
        ['RejectReviveHookModule', RejectReviveHookModule],
    ])('%s импортирует Redis, настройки и PBX', (_name, moduleClass) => {
        const imports = importsOf(moduleClass);

        expect(imports).toContain(RedisModule);
        expect(imports).toContain(PortalAppSettingsModule);
        expect(imports).toContain(PBXModule);
    });
});
