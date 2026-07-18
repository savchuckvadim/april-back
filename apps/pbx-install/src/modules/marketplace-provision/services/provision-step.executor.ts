import { Injectable } from '@nestjs/common';
import { PbxCallingGroupEnum } from '@lib/portal-lib/pbx/app-type';
import {
    SmartGroupEnum,
    SmartNameEnum,
} from '../../smart/dto/install-smart.dto';
import {
    ParseEntityFieldsAppName,
    PbxEntityGroupEnum,
} from '../../shared/entity/field/parse-entity-field.service';
import { ListFolderEnum, ListGroupEnum } from '../../list/type/parse.type';
import { ParseCategoryName } from '../../deal/services/categories/parse-category.service';
import { InstallSmartUseCase } from '../../smart/use-cases/install-smart.use-case';
import { PbxDealFieldInstallByParseUseCase } from '../../deal/use-cases/field/pbx-deal-field-install-by-parse.use-case';
import { PbxDealCategoryInstallByParseUseCase } from '../../deal/use-cases/category/pbx-deal-category-install-by-parse.use-case';
import { PbxCompanyInstallUseCase } from '../../company/use-cases/pbx-company-install.use-case';
import { PbxContactInstallUseCase } from '../../contact/use-cases/pbx-contact-install.use-case';
import { PbxLeadFieldInstallByParseUseCase } from '../../lead/use-cases/field/pbx-lead-field-install-by-parse.use-case';
import { PbxUserInstallUseCase } from '../../user/use-cases/pbx-user-install.use-case';
import { PbxTaskInstallUseCase } from '../../task/use-cases/pbx-task-install.use-case';
import { InstallListUseCase } from '../../list/use-cases/install-list.use-case';
import { PbxGroupInstallUseCase } from '../../group/use-cases/pbx-group-install.use-case';
import { InstallRqUseCase } from '../../rq/use-cases/install-rq.use-case';
import { SyncPortalMeasuresUseCase } from '../../konstructor/portal-measure/use-cases/sync-portal-measures.use-case';
import {
    ProvisionStep,
    ProvisionStepKind,
} from '../config/sales-provision-manifest';

/**
 * Исполнитель одного шага provisioning: маппинг {@link ProvisionStepKind} на
 * существующий install-use-case модуля сущности. DTO собирается из
 * `step.params`; use-case-ы, возвращающие `{ error }` вместо throw,
 * конвертируются в исключение.
 *
 * Инстансы Bitrix здесь не хранятся: каждый use-case сам получает их per-call
 * через PBXService.init(domain) (правило CLAUDE.md про race condition).
 */
@Injectable()
export class ProvisionStepExecutor {
    constructor(
        private readonly installSmart: InstallSmartUseCase,
        private readonly dealFields: PbxDealFieldInstallByParseUseCase,
        private readonly dealCategories: PbxDealCategoryInstallByParseUseCase,
        private readonly companyFields: PbxCompanyInstallUseCase,
        private readonly contactFields: PbxContactInstallUseCase,
        private readonly leadFields: PbxLeadFieldInstallByParseUseCase,
        private readonly userFields: PbxUserInstallUseCase,
        private readonly taskFields: PbxTaskInstallUseCase,
        private readonly installList: InstallListUseCase,
        private readonly installGroup: PbxGroupInstallUseCase,
        private readonly installRq: InstallRqUseCase,
        private readonly syncMeasures: SyncPortalMeasuresUseCase,
    ) {}

    /** Выполнить шаг манифеста для домена; любая ошибка шага — исключение */
    async run(step: ProvisionStep, domain: string): Promise<void> {
        switch (step.kind) {
            case ProvisionStepKind.SMART: {
                const result = await this.installSmart.execute({
                    smartName: this.enumParam(
                        step,
                        'smartName',
                        Object.values(SmartNameEnum),
                    ),
                    group: this.enumParam(
                        step,
                        'group',
                        Object.values(SmartGroupEnum),
                    ),
                    domain,
                });
                this.ensureNoError(step, result);
                return;
            }
            case ProvisionStepKind.DEAL_FIELDS: {
                await this.dealFields.installDealFields(
                    domain,
                    this.entityGroupParam(step),
                    this.appNameParam(step),
                );
                return;
            }
            case ProvisionStepKind.DEAL_CATEGORIES: {
                await this.dealCategories.installDealCategories(
                    domain,
                    this.entityGroupParam(step),
                    this.requireParam(
                        step,
                        'categoryName',
                    ) as ParseCategoryName,
                );
                return;
            }
            case ProvisionStepKind.COMPANY_FIELDS: {
                await this.companyFields.installCompanyFields(
                    domain,
                    this.entityGroupParam(step),
                    this.appNameParam(step),
                );
                return;
            }
            case ProvisionStepKind.CONTACT_FIELDS: {
                await this.contactFields.installContactFields(
                    domain,
                    this.entityGroupParam(step),
                    this.appNameParam(step),
                );
                return;
            }
            case ProvisionStepKind.LEAD_FIELDS: {
                await this.leadFields.installLeadFields(
                    domain,
                    this.entityGroupParam(step),
                    this.appNameParam(step),
                );
                return;
            }
            case ProvisionStepKind.USER_FIELDS: {
                const result = await this.userFields.installUserFields(domain);
                this.ensureNoError(step, result);
                return;
            }
            case ProvisionStepKind.TASK_FIELDS: {
                const result = await this.taskFields.installTaskFields(domain);
                this.ensureNoError(step, result);
                return;
            }
            case ProvisionStepKind.LIST: {
                await this.installList.execute(
                    domain,
                    this.enumParam(
                        step,
                        'listName',
                        Object.values(ListFolderEnum),
                    ),
                    this.enumParam(step, 'group', Object.values(ListGroupEnum)),
                );
                return;
            }
            case ProvisionStepKind.GROUP: {
                await this.installGroup.installGroup(
                    domain,
                    this.enumParam(
                        step,
                        'group',
                        Object.values(PbxCallingGroupEnum),
                    ),
                );
                return;
            }
            case ProvisionStepKind.RQ: {
                await this.installRq.installAll(domain);
                return;
            }
            case ProvisionStepKind.MEASURES: {
                await this.syncMeasures.syncByDomain(domain);
                return;
            }
            case ProvisionStepKind.RPA:
                // RPA не выполняются воркером: оркестратор помечает такой шаг
                // skipped (tariff_restricted) ДО вызова executor-а.
                throw new Error(
                    `Шаг "${step.title}": RPA-процессы недоступны на тарифе маркетплейса`,
                );
            case ProvisionStepKind.DEPARTAMENT:
                // Требует bitrixId существующего отдела — автоустановка невозможна.
                throw new Error(
                    `Шаг "${step.title}": установка отдела требует bitrixId и не поддерживается воркером`,
                );
            default: {
                const unknownKind: never = step.kind;
                throw new Error(
                    `Неизвестный вид шага provisioning: ${String(unknownKind)}`,
                );
            }
        }
    }

    /** Обязательный строковый параметр шага */
    private requireParam(step: ProvisionStep, key: string): string {
        const value = step.params[key];
        if (!value) {
            throw new Error(
                `Шаг "${step.componentCode}": отсутствует параметр "${key}"`,
            );
        }
        return value;
    }

    /** Параметр шага, значение которого обязано входить в enum */
    private enumParam<T extends string>(
        step: ProvisionStep,
        key: string,
        allowed: readonly T[],
    ): T {
        const value = this.requireParam(step, key);
        if (!allowed.includes(value as T)) {
            throw new Error(
                `Шаг "${step.componentCode}": недопустимое значение "${value}" параметра "${key}"`,
            );
        }
        return value as T;
    }

    private entityGroupParam(step: ProvisionStep): PbxEntityGroupEnum {
        return this.enumParam(step, 'group', Object.values(PbxEntityGroupEnum));
    }

    private appNameParam(step: ProvisionStep): ParseEntityFieldsAppName {
        return this.enumParam(
            step,
            'appName',
            Object.values(ParseEntityFieldsAppName),
        );
    }

    /** use-case-ы, возвращающие `{ error }` вместо throw → исключение */
    private ensureNoError(step: ProvisionStep, result: unknown): void {
        if (
            result !== null &&
            typeof result === 'object' &&
            'error' in result
        ) {
            const error = (result as { error: unknown }).error;
            if (error) {
                const message =
                    typeof error === 'string' ? error : JSON.stringify(error);
                throw new Error(`Шаг "${step.title}": ${message}`);
            }
        }
    }
}
