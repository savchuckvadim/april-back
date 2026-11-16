import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PortalSessionGuard, PortalSessionModule } from '@lib/auth';
import { EventSalesBxRecordsModule } from '../bx-records.module';
import { BxRecordsController } from '../controllers/bx-records.controller';

/**
 * Записи звонков компании отдают адреса файлов записей — ручка стоит под
 * проверкой сессии портала (домен запроса сверяется с доменом сессии).
 */
describe('BxRecordsController: проверка сессии портала', () => {
    it('ручка записей компании помечена проверкой сессии', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            Object.getOwnPropertyDescriptor(
                BxRecordsController.prototype,
                'getRecordsByCompany',
            )?.value as object,
        ) as unknown[] | undefined;
        expect(guards).toEqual([PortalSessionGuard]);
    });

    it('модуль подключает проверку сессии — иначе приложение не стартует', () => {
        const imports = Reflect.getMetadata(
            'imports',
            EventSalesBxRecordsModule,
        ) as unknown[];
        expect(imports).toContain(PortalSessionModule);
    });
});
