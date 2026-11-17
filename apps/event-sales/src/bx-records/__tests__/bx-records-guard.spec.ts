import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PortalSessionGuard, PortalSessionModule } from '@lib/auth';
import {
    AiModule,
    AiService,
    CallPageLinkModule,
    CallPageLinkService,
    TranscriptionCallStateService,
    TranscriptionStoreModule,
} from '@lib/call-lib';
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

    it('ручка звонков клиента помечена проверкой сессии', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            Object.getOwnPropertyDescriptor(
                BxRecordsController.prototype,
                'getClientCalls',
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

    it('модуль подключает всё, что нужно списку звонков клиента', () => {
        const exportsOf = (module: object): unknown[] =>
            Reflect.getMetadata('exports', module) as unknown[];
        const imports = Reflect.getMetadata(
            'imports',
            EventSalesBxRecordsModule,
        ) as unknown[];

        expect(imports).toEqual(
            expect.arrayContaining([
                TranscriptionStoreModule,
                AiModule,
                CallPageLinkModule,
            ]),
        );
        expect(exportsOf(TranscriptionStoreModule)).toContain(
            TranscriptionCallStateService,
        );
        expect(exportsOf(AiModule)).toContain(AiService);
        expect(exportsOf(CallPageLinkModule)).toContain(CallPageLinkService);
    });
});
