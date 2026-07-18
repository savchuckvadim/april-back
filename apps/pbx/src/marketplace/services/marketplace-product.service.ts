import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    MarketplaceComponentType,
    MarketplaceProvisionJobPayload,
    MarketplaceProvisionTrigger,
} from '@lib/marketplace-core';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceProduct } from '../config/marketplace-manifest';
import {
    ActivateProductDto,
    ActivationResultDto,
} from '../dto/marketplace-product.dto';

/**
 * Активация продукта на портале (approve заявки = активация sales):
 *  1) portals.approval_status='approved' (+approved_at/approved_by);
 *  2) upsert portal_products (status='active');
 *  3) агрегатный компонент pbx_entities → pending (снимает заглушку
 *     awaiting_approval; создаёт компонент, если approve пришёл раньше
 *     завершения install-пайплайна — гонка закрыта);
 *  4) dispatch фоновой задачи provisioning (воркер — apps/pbx-install).
 *
 * Идемпотентно: повторный approve не дублирует продукт (upsert) и не
 * плодит задачи (стабильный jobId + removeOnComplete).
 */
@Injectable()
export class MarketplaceProductService {
    private readonly logger = new Logger(MarketplaceProductService.name);

    constructor(
        private readonly repository: MarketplaceInstallRepository,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    /** Approve = активация: допуск + продукт + запуск provisioning */
    async activateProduct(
        dto: ActivateProductDto,
    ): Promise<ActivationResultDto> {
        const install = await this.resolveInstall(dto);
        const portal = install.portals;

        await this.repository.setApprovalStatus(
            portal.id,
            'approved',
            dto.approvedBy,
        );
        const product = await this.repository.upsertPortalProduct(
            portal.id,
            dto.productCode,
            'active',
        );
        await this.repository.upsertComponents(install.id, portal.id, [
            {
                productCode: dto.productCode,
                componentType: MarketplaceComponentType.PBX_ENTITIES,
                componentCode: '',
                status: 'pending',
                reasonCode: 'queued',
                errorDetail: undefined,
            },
        ]);

        const jobId = await this.dispatchProvision(
            install.portals,
            dto.productCode,
            'approve',
        );

        await this.repository.logEvent({
            memberId: portal.member_id ?? undefined,
            domain: portal.domain ?? undefined,
            event: 'PRODUCT_ACTIVATED',
            status: 'processed',
            payload: JSON.stringify({
                productCode: dto.productCode,
                approvedBy: dto.approvedBy,
            }),
        });
        this.logger.log(
            `Product activated: portal=${portal.id} product=${dto.productCode} job=${jobId ?? '-'}`,
        );

        return {
            portalId: portal.id.toString(),
            productCode: dto.productCode,
            approvalStatus: 'approved',
            productStatus: product.status,
            provisionDispatched: jobId !== undefined,
            provisionJobId: jobId,
        };
    }

    /**
     * Повторный запуск provisioning (без изменения допуска/продукта) —
     * admin-операция после исправления ошибок установки сущностей.
     */
    async redispatchProvision(
        dto: ActivateProductDto,
    ): Promise<ActivationResultDto> {
        const install = await this.resolveInstall(dto);
        const portal = install.portals;

        const products = await this.repository.findPortalProducts(portal.id);
        const productCode: string = dto.productCode;
        const product = products.find(
            item => item.product_code === productCode,
        );
        if (!product || product.status !== 'active') {
            throw new BadRequestException(
                `Продукт ${dto.productCode} не активирован на портале — сначала выполните активацию (approve)`,
            );
        }

        const jobId = await this.dispatchProvision(
            portal,
            dto.productCode,
            'admin_refresh',
        );
        return {
            portalId: portal.id.toString(),
            productCode: dto.productCode,
            approvalStatus: portal.approval_status ?? 'approved',
            productStatus: product.status,
            provisionDispatched: jobId !== undefined,
            provisionJobId: jobId,
        };
    }

    private async resolveInstall(dto: ActivateProductDto) {
        if (!dto.memberId && !dto.domain) {
            throw new BadRequestException('Укажите memberId или domain');
        }
        const install = dto.memberId
            ? await this.repository.findInstallByMemberId(
                  dto.memberId,
                  this.appCode(),
              )
            : await this.repository.findInstallByDomain(
                  dto.domain as string,
                  this.appCode(),
              );
        if (!install) {
            throw new NotFoundException('Установка не найдена');
        }
        if (install.uninstalled_at) {
            throw new BadRequestException(
                'Приложение удалено с портала — активация невозможна',
            );
        }
        return install;
    }

    private async dispatchProvision(
        portal: { domain: string | null; member_id: string | null },
        productCode: MarketplaceProduct,
        trigger: MarketplaceProvisionTrigger,
    ): Promise<string | undefined> {
        if (!portal.domain || !portal.member_id) {
            this.logger.warn(
                `Provision не поставлен: у портала нет domain/member_id (domain=${portal.domain ?? '-'})`,
            );
            return undefined;
        }
        const payload: MarketplaceProvisionJobPayload = {
            domain: portal.domain,
            memberId: portal.member_id,
            productCode,
            trigger,
            requestId: randomUUID(),
        };
        const jobId = `mp-provision:${portal.member_id}:${productCode}`;
        await this.queueDispatcher.dispatch(
            QueueNames.MARKETPLACE_PROVISION,
            JobNames.MARKETPLACE_PROVISION_PRODUCT,
            payload,
            jobId,
            {
                attempts: 3,
                backoff: { type: 'exponential', delay: 60_000 },
                // без removeOnComplete Bull не примет повторный job с тем же
                // jobId (admin refresh после успешного прогона)
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        return jobId;
    }

    private appCode(): string {
        return BITRIX_APP_CODES.GARANT as string;
    }
}
