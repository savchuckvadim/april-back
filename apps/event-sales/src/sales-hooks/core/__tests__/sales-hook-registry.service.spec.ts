import { SalesHookRegistryService } from '../services/sales-hook-registry.service';
import { EnumSalesHookCode } from '../constants/sales-hook-code.enum';
import { ISalesHookUseCase } from '../contracts/sales-hook-use-case.contract';

const useCase = (hook: EnumSalesHookCode): ISalesHookUseCase => ({
    hook,
    execute: jest.fn().mockResolvedValue({}),
});

describe('SalesHookRegistryService', () => {
    it('отдаёт зарегистрированный use-case по коду', () => {
        const registry = new SalesHookRegistryService();
        const leadToWork = useCase(EnumSalesHookCode.LEAD_TO_WORK);
        registry.register(leadToWork);
        expect(registry.get(EnumSalesHookCode.LEAD_TO_WORK)).toBe(leadToWork);
    });

    it('повторная регистрация того же кода — ошибка', () => {
        const registry = new SalesHookRegistryService();
        registry.register(useCase(EnumSalesHookCode.LEAD_TO_WORK));
        expect(() =>
            registry.register(useCase(EnumSalesHookCode.LEAD_TO_WORK)),
        ).toThrow('зарегистрирован дважды');
    });

    it('запрос незарегистрированного кода — доменная ошибка на русском', () => {
        const registry = new SalesHookRegistryService();
        expect(() => registry.get(EnumSalesHookCode.MERGE_DUPLICATES)).toThrow(
            'не зарегистрирован',
        );
    });
});
