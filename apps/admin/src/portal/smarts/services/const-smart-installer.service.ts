import { BadRequestException, Injectable } from '@nestjs/common';
import {
    InstallCallReportSmartResult,
    InstallCallReportSmartUseCase,
} from '@lib/call-lib';
import { InstallSkapSmartUseCase } from '@lib/skap-lib';
import { InstallZprSmartUseCase } from '@app/pbx-install/smart/zpr/install-zpr-smart.use-case';
import { InstallPresentationSmartUseCase } from '@app/pbx-install/smart/presentation/install-presentation-smart.use-case';
import { InstallComplectVariantSmartUseCase } from '@app/pbx-install/smart/complect-variant/install-complect-variant-smart.use-case';
import { CONST_SMART_REGISTRY } from '@lib/portal-lib/pbx/const-smart-registry';

/** Общий контракт установщика const-смарта. */
export interface ConstSmartInstaller {
    execute(domain: string): Promise<InstallCallReportSmartResult>;
}

/**
 * Резолвер kind → use-case установки const-смарта (generic install для
 * галереи). Новый const-смарт: descriptor в его pbx-модуле → строка в
 * CONST_SMART_REGISTRY → строка в byKind здесь. Фронт не меняется.
 */
@Injectable()
export class ConstSmartInstallerResolver {
    private readonly byKind: Record<string, ConstSmartInstaller>;

    constructor(
        aicallInstaller: InstallCallReportSmartUseCase,
        skapInstaller: InstallSkapSmartUseCase,
        zprInstaller: InstallZprSmartUseCase,
        presentationInstaller: InstallPresentationSmartUseCase,
        complectVariantInstaller: InstallComplectVariantSmartUseCase,
    ) {
        this.byKind = {
            aicall: aicallInstaller,
            skap: skapInstaller,
            // ЗПР — первый const-смарт с воронкой/стадиями.
            zpr: zprInstaller,
            // «Презентации» — зеркало сделок sales_presentation (тип 'pres').
            presentation: presentationInstaller,
            // «Варианты комплекта» — несколько предложений на одной сделке.
            complect_variant: complectVariantInstaller,
        };
    }

    resolve(kind: string): ConstSmartInstaller {
        const installer = this.byKind[kind];
        if (!installer) {
            const known = CONST_SMART_REGISTRY.map(
                descriptor => descriptor.kind,
            ).join(', ');
            throw new BadRequestException(
                `Неизвестный const-смарт "${kind}". Доступны: ${known}`,
            );
        }
        return installer;
    }
}
