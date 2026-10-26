import { findMissingModuleDependencies } from '@lib/core/testing/module-di';
import { SupportMonitorModule } from '../support-monitor.module';
import { SupportMonitorAdminModule } from '../support-monitor.admin.module';
import { SupportMonitorAdminController } from '../admin/support-monitor-admin.controller';

describe('DI-граф модулей монитора поддержки', () => {
    it('SupportMonitorModule: все зависимости сервисов доступны', () => {
        expect(findMissingModuleDependencies(SupportMonitorModule)).toEqual([]);
    });

    it('SupportMonitorAdminModule: контроллер получает свои сервисы', () => {
        expect(
            findMissingModuleDependencies(SupportMonitorAdminModule),
        ).toEqual([]);
    });

    it('сервисный модуль без контроллеров — ручки не утекут в Swagger bot', () => {
        expect(
            Reflect.getMetadata('controllers', SupportMonitorModule) ?? [],
        ).toEqual([]);
        expect(
            Reflect.getMetadata('controllers', SupportMonitorAdminModule),
        ).toEqual([SupportMonitorAdminController]);
    });
});
