import { Injectable, Logger } from '@nestjs/common';
import {
    MarketplaceAuthRepository,
    MarketplaceComponentStateRepository,
    MarketplaceComponentType,
    MarketplaceProvisionJobPayload,
} from '@lib/marketplace-core';
import { PRODUCT_PROVISION_MANIFESTS } from '../config/sales-provision-manifest';
import { ProvisionStepExecutor } from '../services/provision-step.executor';

/** Максимальная длина error_detail одного шага */
const ERROR_DETAIL_MAX_LENGTH = 1000;

/** component_code агрегатного компонента pbx_entities (ключ готовности роутера) */
const AGGREGATE_COMPONENT_CODE = '';

/** Итог одного прогона provisioning */
export interface ProvisionResult {
    /** 'no_install' — активной установки нет; 'installed' — все шаги успешны */
    status: 'no_install' | 'unknown_product' | 'installed';
    installedSteps: number;
    skippedSteps: number;
}

/** Упавший шаг для агрегатного error_detail */
interface FailedStep {
    componentCode: string;
    title: string;
    message: string;
}

/**
 * Оркестратор provisioning pbx-сущностей маркетплейс-продукта.
 *
 * Последовательно выполняет шаги манифеста продукта, пишет по-шаговые статусы
 * в marketplace_install_components (productCode из payload) и ведёт агрегатный
 * компонент pbx_entities с пустым component_code — его читает роутер apps/pbx
 * как признак готовности. Ошибка шага не прерывает остальные шаги; при наличии
 * ошибок в конце бросается исключение (Bull сделает retry, прогон идемпотентен).
 */
@Injectable()
export class ProvisionProductUseCase {
    private readonly logger = new Logger(ProvisionProductUseCase.name);

    constructor(
        private readonly auth: MarketplaceAuthRepository,
        private readonly componentState: MarketplaceComponentStateRepository,
        private readonly executor: ProvisionStepExecutor,
    ) {}

    async execute(
        payload: MarketplaceProvisionJobPayload,
    ): Promise<ProvisionResult> {
        const { domain, memberId, productCode, requestId } = payload;
        const logPrefix = `[${requestId}] ${domain} product=${productCode}`;

        const install = await this.auth.findActiveInstall({ memberId });
        if (!install) {
            // Ретраи бессмысленны: установки нет (или уже удалена) — только лог.
            this.logger.warn(
                `${logPrefix}: активная установка не найдена (memberId=${memberId}), provisioning пропущен`,
            );
            return { status: 'no_install', installedSteps: 0, skippedSteps: 0 };
        }

        const steps = PRODUCT_PROVISION_MANIFESTS[productCode];
        if (!steps) {
            // Неизвестный продукт — ретраи тоже бессмысленны.
            this.logger.error(
                `${logPrefix}: манифест provisioning для продукта не найден`,
            );
            return {
                status: 'unknown_product',
                installedSteps: 0,
                skippedSteps: 0,
            };
        }

        const portalId = install.portal_id;
        await this.componentState.setInstallStatus(install.id, 'provisioning');
        await this.setAggregateStatus(install.id, portalId, productCode, {
            status: 'installing',
        });

        let installedSteps = 0;
        let skippedSteps = 0;
        const failedSteps: FailedStep[] = [];

        for (const step of steps) {
            if (step.skippedByTariff) {
                await this.componentState.setComponentStatus(
                    install.id,
                    portalId,
                    {
                        productCode,
                        componentType: MarketplaceComponentType.PBX_ENTITIES,
                        componentCode: step.componentCode,
                        status: 'skipped',
                        reasonCode: 'tariff_restricted',
                        errorDetail:
                            'RPA-процессы недоступны на тарифе маркетплейса',
                    },
                );
                skippedSteps += 1;
                this.logger.log(
                    `${logPrefix}: шаг ${step.componentCode} пропущен (tariff_restricted)`,
                );
                continue;
            }

            await this.componentState.setComponentStatus(install.id, portalId, {
                productCode,
                componentType: MarketplaceComponentType.PBX_ENTITIES,
                componentCode: step.componentCode,
                status: 'installing',
            });

            try {
                await this.executor.run(step, domain);
                await this.componentState.setComponentStatus(
                    install.id,
                    portalId,
                    {
                        productCode,
                        componentType: MarketplaceComponentType.PBX_ENTITIES,
                        componentCode: step.componentCode,
                        status: 'installed',
                    },
                );
                installedSteps += 1;
                this.logger.log(
                    `${logPrefix}: шаг ${step.componentCode} установлен`,
                );
            } catch (error) {
                const message = this.truncate(
                    error instanceof Error ? error.message : String(error),
                );
                await this.componentState.setComponentStatus(
                    install.id,
                    portalId,
                    {
                        productCode,
                        componentType: MarketplaceComponentType.PBX_ENTITIES,
                        componentCode: step.componentCode,
                        status: 'error',
                        errorDetail: message,
                    },
                );
                failedSteps.push({
                    componentCode: step.componentCode,
                    title: step.title,
                    message,
                });
                this.logger.error(
                    `${logPrefix}: шаг ${step.componentCode} упал: ${message}`,
                );
                // продолжаем следующие шаги — частичная установка лучше пустой
            }
        }

        if (failedSteps.length === 0) {
            await this.setAggregateStatus(install.id, portalId, productCode, {
                status: 'installed',
            });
            await this.componentState.setInstallStatus(install.id, 'installed');
            this.logger.log(
                `${logPrefix}: provisioning завершён (installed=${installedSteps}, skipped=${skippedSteps})`,
            );
            return { status: 'installed', installedSteps, skippedSteps };
        }

        const failedSummary = this.truncate(
            failedSteps
                .map(f => `${f.componentCode} (${f.title}): ${f.message}`)
                .join('; '),
        );
        await this.setAggregateStatus(install.id, portalId, productCode, {
            status: 'error',
            reasonCode: 'partial_failure',
            errorDetail: failedSummary,
        });
        await this.componentState.setInstallStatus(
            install.id,
            'error',
            'provisioning',
            failedSummary,
        );
        // throw — чтобы Bull сделал retry; повторный прогон идемпотентен:
        // уже установленные сущности use-case-ы переиспользуют.
        throw new Error(
            `Provisioning ${productCode} на ${domain}: упало шагов ${failedSteps.length} из ${steps.length} — ${failedSummary}`,
        );
    }

    /** Статус агрегатного компонента pbx_entities (componentCode = '') */
    private async setAggregateStatus(
        installId: string,
        portalId: bigint,
        productCode: string,
        state: {
            status: 'installing' | 'installed' | 'error';
            reasonCode?: string;
            errorDetail?: string;
        },
    ): Promise<void> {
        await this.componentState.setComponentStatus(installId, portalId, {
            productCode,
            componentType: MarketplaceComponentType.PBX_ENTITIES,
            componentCode: AGGREGATE_COMPONENT_CODE,
            status: state.status,
            reasonCode: state.reasonCode,
            errorDetail: state.errorDetail,
        });
    }

    private truncate(message: string): string {
        return message.length > ERROR_DETAIL_MAX_LENGTH
            ? `${message.slice(0, ERROR_DETAIL_MAX_LENGTH - 1)}…`
            : message;
    }
}
