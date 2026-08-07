import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import { ISalesHookUseCase } from '../contracts/sales-hook-use-case.contract';

/**
 * Реестр use-case-ов хуков. Хук-модули самостоятельно регистрируются в
 * onModuleInit (у Nest нет multi-провайдеров, собирать массив одним токеном
 * из разных модулей нельзя). Полнота покрытия проверяется на
 * onApplicationBootstrap — он выполняется после onModuleInit всех модулей,
 * поэтому «забыли зарегистрировать» видно при старте, а не в бою.
 */
@Injectable()
export class SalesHookRegistryService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SalesHookRegistryService.name);
    private readonly byCode = new Map<EnumSalesHookCode, ISalesHookUseCase>();

    register(useCase: ISalesHookUseCase): void {
        if (this.byCode.has(useCase.hook)) {
            throw new Error(
                `Sales-хук «${useCase.hook}» зарегистрирован дважды — проверьте модули хуков`,
            );
        }
        this.byCode.set(useCase.hook, useCase);
    }

    onApplicationBootstrap(): void {
        const missing = Object.values(EnumSalesHookCode).filter(
            code => !this.byCode.has(code),
        );
        if (missing.length) {
            this.logger.warn(
                `Не зарегистрированы use-case-ы sales-хуков: ${missing.join(', ')} — их операции будут падать`,
            );
        }
    }

    get(code: EnumSalesHookCode): ISalesHookUseCase {
        const useCase = this.byCode.get(code);
        if (!useCase) {
            throw new Error(
                `Use-case sales-хука «${code}» не зарегистрирован в SalesHookRegistryService`,
            );
        }
        return useCase;
    }
}
