import { Injectable } from '@nestjs/common';
import {
    PbxPresentationSmartService,
    PRESENTATION_SMART_DESCRIPTOR,
    PRESENTATION_SMART_FIELDS,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    InstallConstSmartResult,
    InstallConstSmartService,
} from '../const/install-const-smart.service';

export type InstallPresentationSmartResult = InstallConstSmartResult;

/**
 * Установка смарт-процесса «Презентации» — зеркала сделок «ОП Презентации».
 *
 * Тонкая обёртка над общим движком {@link InstallConstSmartService}: тип со
 * стадиями, воронка `pres_main` (стадии формы sales_presentation + контур
 * согласования заявки), поля реестра PRESENTATION_SMART_FIELDS, зеркала в
 * PortalDB и сброс кэшей — всё там же, где у ЗПР. Числа не дублируем: состав
 * задаётся константами смарта, а `fieldsCount` дескриптора считается из них.
 *
 * Идемпотентна по PRESENTATION_SMART_CODE (`pres_sales`). Установка НИЧЕГО
 * не отключает: сделки-презентации продолжают работать, смарт живёт
 * параллельно (см. README pbx-presentation-smart).
 */
@Injectable()
export class InstallPresentationSmartUseCase {
    constructor(
        private readonly installConstSmart: InstallConstSmartService,
        private readonly presentationSmartService: PbxPresentationSmartService,
    ) {}

    async execute(domain: string): Promise<InstallPresentationSmartResult> {
        return this.installConstSmart.execute({
            domain,
            descriptor: PRESENTATION_SMART_DESCRIPTOR,
            fields: PRESENTATION_SMART_FIELDS,
            // Зеркало полей в PortalDB + сброс in-memory резолва смарта.
            mirror: this.presentationSmartService,
        });
    }
}
