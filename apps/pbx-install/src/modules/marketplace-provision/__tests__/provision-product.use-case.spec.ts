import {
    MarketplaceAuthRepository,
    MarketplaceComponentStateRepository,
    MarketplaceComponentType,
    MarketplaceProvisionJobPayload,
} from '@lib/marketplace-core';
import { ProvisionProductUseCase } from '../use-cases/provision-product.use-case';
import { ProvisionStepExecutor } from '../services/provision-step.executor';
import { SALES_PROVISION_STEPS } from '../config/sales-provision-manifest';

describe('ProvisionProductUseCase', () => {
    type AuthMock = jest.Mocked<
        Pick<MarketplaceAuthRepository, 'findActiveInstall'>
    >;
    type StateMock = jest.Mocked<
        Pick<
            MarketplaceComponentStateRepository,
            'setComponentStatus' | 'setInstallStatus'
        >
    >;
    type ExecutorMock = jest.Mocked<Pick<ProvisionStepExecutor, 'run'>>;

    const install = {
        id: 'install-1',
        portal_id: BigInt(7),
    };

    const payload: MarketplaceProvisionJobPayload = {
        domain: 'demo.bitrix24.ru',
        memberId: 'member-1',
        productCode: 'sales',
        trigger: 'approve',
        requestId: 'req-1',
    };

    const activeSteps = SALES_PROVISION_STEPS.filter(s => !s.skippedByTariff);
    const skippedSteps = SALES_PROVISION_STEPS.filter(s => s.skippedByTariff);

    let auth: AuthMock;
    let componentState: StateMock;
    let executor: ExecutorMock;
    let useCase: ProvisionProductUseCase;

    /** Все вызовы setComponentStatus по componentCode */
    const callsByCode = (code: string) =>
        componentState.setComponentStatus.mock.calls.filter(
            ([, , item]) => item.componentCode === code,
        );

    beforeEach(() => {
        auth = {
            findActiveInstall: jest.fn().mockResolvedValue(install),
        } as unknown as AuthMock;
        componentState = {
            setComponentStatus: jest.fn().mockResolvedValue(undefined),
            setInstallStatus: jest.fn().mockResolvedValue(undefined),
        } as unknown as StateMock;
        executor = {
            run: jest.fn().mockResolvedValue(undefined),
        } as unknown as ExecutorMock;
        useCase = new ProvisionProductUseCase(
            auth as unknown as MarketplaceAuthRepository,
            componentState as unknown as MarketplaceComponentStateRepository,
            executor as unknown as ProvisionStepExecutor,
        );
    });

    it('happy-path: агрегат installing → installed, install_status provisioning → installed', async () => {
        const result = await useCase.execute(payload);

        expect(auth.findActiveInstall).toHaveBeenCalledWith({
            memberId: 'member-1',
        });
        // статусы установки: provisioning в начале, installed в конце
        expect(componentState.setInstallStatus.mock.calls).toEqual([
            ['install-1', 'provisioning'],
            ['install-1', 'installed'],
        ]);
        // агрегатный компонент (componentCode '') — installing затем installed
        const aggregateCalls = callsByCode('');
        expect(aggregateCalls[0][2]).toMatchObject({
            productCode: 'sales',
            componentType: MarketplaceComponentType.PBX_ENTITIES,
            status: 'installing',
        });
        expect(aggregateCalls[aggregateCalls.length - 1][2]).toMatchObject({
            status: 'installed',
        });
        // все компонентные статусы пишутся с portalId установки
        for (const call of componentState.setComponentStatus.mock.calls) {
            expect(call[0]).toBe('install-1');
            expect(call[1]).toBe(BigInt(7));
        }
        // executor вызван для каждого не-skipped шага с domain из payload
        expect(executor.run).toHaveBeenCalledTimes(activeSteps.length);
        for (const step of activeSteps) {
            expect(executor.run).toHaveBeenCalledWith(step, 'demo.bitrix24.ru');
        }
        expect(result).toEqual({
            status: 'installed',
            installedSteps: activeSteps.length,
            skippedSteps: skippedSteps.length,
        });
    });

    it('RPA-шаг: статус skipped/tariff_restricted, executor.run для него НЕ вызывается', async () => {
        await useCase.execute(payload);

        expect(skippedSteps.length).toBeGreaterThan(0);
        for (const step of skippedSteps) {
            const calls = callsByCode(step.componentCode);
            expect(calls).toHaveLength(1);
            expect(calls[0][2]).toMatchObject({
                status: 'skipped',
                reasonCode: 'tariff_restricted',
            });
            expect(executor.run).not.toHaveBeenCalledWith(
                step,
                expect.anything(),
            );
        }
    });

    it('ошибка одного шага: остальные выполняются, агрегат error/partial_failure, install_status error, throw', async () => {
        const failingStep = activeSteps[0];
        executor.run.mockImplementation(step => {
            if (step.componentCode === failingStep.componentCode) {
                return Promise.reject(new Error('Bitrix timeout'));
            }
            return Promise.resolve();
        });

        await expect(useCase.execute(payload)).rejects.toThrow(
            'Provisioning sales',
        );

        // упавший шаг помечен error с деталями
        const failedCalls = callsByCode(failingStep.componentCode);
        expect(failedCalls[failedCalls.length - 1][2]).toMatchObject({
            status: 'error',
            errorDetail: 'Bitrix timeout',
        });
        // остальные шаги всё равно выполнились
        expect(executor.run).toHaveBeenCalledTimes(activeSteps.length);
        // агрегат — error/partial_failure с упоминанием шага
        const aggregateCalls = callsByCode('');
        const lastAggregate = aggregateCalls[aggregateCalls.length - 1][2];
        expect(lastAggregate).toMatchObject({
            status: 'error',
            reasonCode: 'partial_failure',
        });
        expect(lastAggregate.errorDetail).toContain(failingStep.componentCode);
        // install_status: provisioning → error с errorStep provisioning
        const lastStatusCall =
            componentState.setInstallStatus.mock.calls.at(-1);
        expect(lastStatusCall?.[1]).toBe('error');
        expect(lastStatusCall?.[2]).toBe('provisioning');
        expect(lastStatusCall?.[3]).toContain(failingStep.componentCode);
    });

    it('установка не найдена: выход без throw, статусы и executor не трогаются', async () => {
        auth.findActiveInstall.mockResolvedValue(null);

        const result = await useCase.execute(payload);

        expect(result).toEqual({
            status: 'no_install',
            installedSteps: 0,
            skippedSteps: 0,
        });
        expect(componentState.setInstallStatus).not.toHaveBeenCalled();
        expect(componentState.setComponentStatus).not.toHaveBeenCalled();
        expect(executor.run).not.toHaveBeenCalled();
    });

    it('неизвестный продукт: выход без throw и без выполнения шагов', async () => {
        const result = await useCase.execute({
            ...payload,
            productCode: 'unknown-product',
        });

        expect(result.status).toBe('unknown_product');
        expect(executor.run).not.toHaveBeenCalled();
        expect(componentState.setInstallStatus).not.toHaveBeenCalled();
    });

    it('длинное сообщение ошибки шага обрезается до ~1000 символов', async () => {
        const failingStep = activeSteps[0];
        executor.run.mockImplementation(step =>
            step.componentCode === failingStep.componentCode
                ? Promise.reject(new Error('x'.repeat(5000)))
                : Promise.resolve(),
        );

        await expect(useCase.execute(payload)).rejects.toThrow();

        const failedCalls = callsByCode(failingStep.componentCode);
        const detail = failedCalls[failedCalls.length - 1][2].errorDetail;
        expect(detail).toBeDefined();
        expect((detail as string).length).toBeLessThanOrEqual(1000);
    });
});
