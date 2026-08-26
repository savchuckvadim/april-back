import { Injectable } from '@nestjs/common';
import {
    PbxZprSmartService,
    ZPR_SMART_DESCRIPTOR,
    ZPR_SMART_FIELDS,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    InstallConstSmartResult,
    InstallConstSmartService,
} from '../const/install-const-smart.service';

export type InstallZprSmartResult = InstallConstSmartResult;

/**
 * Установка смарт-процесса «Звонки По решению» на портал по const-конфигу —
 * первый const-смарт СО СТАДИЯМИ.
 *
 * Сам сценарий (тип + воронка/стадии + поля с items + зеркала + сброс
 * кэшей) живёт в общем движке {@link InstallConstSmartService}: он был
 * вынесен из этого use-case, когда следом за ЗПР пришёл смарт
 * «Презентации» — различаются они только описателем и набором полей.
 *
 * Идемпотентна по ZPR_SMART_CODE: повторный запуск не создаёт дубликатов
 * типа, доливает только отсутствующие поля и приводит воронку/стадии к
 * эталону (обновите ZPR_SMART_* и вызовите установку повторно).
 */
@Injectable()
export class InstallZprSmartUseCase {
    constructor(
        private readonly installConstSmart: InstallConstSmartService,
        private readonly zprSmartService: PbxZprSmartService,
    ) {}

    async execute(domain: string): Promise<InstallZprSmartResult> {
        return this.installConstSmart.execute({
            domain,
            descriptor: ZPR_SMART_DESCRIPTOR,
            fields: ZPR_SMART_FIELDS,
            // Зеркало полей в PortalDB + сброс in-memory резолва ЗПР.
            mirror: this.zprSmartService,
        });
    }
}
