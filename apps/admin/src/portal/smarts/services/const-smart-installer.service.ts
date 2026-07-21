import { BadRequestException, Injectable } from '@nestjs/common';
import {
    InstallCallReportSmartResult,
    InstallCallReportSmartUseCase,
} from '@lib/call-lib';
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

    constructor(aicallInstaller: InstallCallReportSmartUseCase) {
        this.byKind = {
            aicall: aicallInstaller,
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
