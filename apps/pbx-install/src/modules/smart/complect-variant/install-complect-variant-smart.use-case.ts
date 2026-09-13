import { Injectable } from '@nestjs/common';
import {
    COMPLECT_VARIANT_SMART_DESCRIPTOR,
    COMPLECT_VARIANT_SMART_FIELDS,
    PbxComplectVariantSmartService,
} from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import {
    InstallConstSmartResult,
    InstallConstSmartService,
} from '../const/install-const-smart.service';

export type InstallComplectVariantSmartResult = InstallConstSmartResult;

/**
 * Установка смарт-процесса «Варианты комплекта».
 *
 * Тонкая обёртка над общим движком {@link InstallConstSmartService}: тип со
 * стадиями (статус варианта), воронка `cvar_main`, поля из
 * COMPLECT_VARIANT_SMART_FIELDS (зеркало konstructor-полей сделки), зеркало в
 * PortalDB и сброс кэшей — всё там же, где у ЗПР и Презентаций.
 *
 * Отличие от собратьев: у типа включены товарные строки
 * (`hasProductRows` в дескрипторе) — вариант без состава продажи бессмыслен.
 *
 * Идемпотентна по COMPLECT_VARIANT_SMART_CODE (`complect_variant_sales`).
 */
@Injectable()
export class InstallComplectVariantSmartUseCase {
    constructor(
        private readonly installConstSmart: InstallConstSmartService,
        private readonly complectVariantSmartService: PbxComplectVariantSmartService,
    ) {}

    async execute(domain: string): Promise<InstallComplectVariantSmartResult> {
        return this.installConstSmart.execute({
            domain,
            descriptor: COMPLECT_VARIANT_SMART_DESCRIPTOR,
            fields: COMPLECT_VARIANT_SMART_FIELDS,
            mirror: this.complectVariantSmartService,
        });
    }
}
