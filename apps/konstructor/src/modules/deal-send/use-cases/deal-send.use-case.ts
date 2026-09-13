import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { IBXDeal } from '@lib/bitrix';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { DealSendDto, DealSendResponseDto } from '../dto/deal-send.dto';
import { DealFieldResolverService } from '../services/deal-field-resolver.service';
import { DealSendJobDto } from '../dto/deal-send-job.dto';

/**
 * Отправка сделки из конструктора.
 *
 * Разделение как в легаси: сделка создаётся синхронно (фронту немедленно нужен
 * её id, чтобы сохранить слепок и увести менеджера в карточку), а запись полей
 * и товарных строк уходит в очередь — это десятки значений и отдельный вызов
 * productrow.set.
 */
@Injectable()
export class DealSendUseCase {
    private readonly logger = new Logger(DealSendUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    async execute(dto: DealSendDto): Promise<DealSendResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);

        const resolver = new DealFieldResolverService(PortalModel);
        const { fields, skipped } = resolver.resolve(dto.fields);

        if (skipped.length) {
            const details = skipped
                .map(item => `${item.code} (${item.reason})`)
                .join(', ');
            this.logger.warn(`${dto.domain}: не записаны поля — ${details}`);
        }

        let dealId = dto.dealId ?? null;
        let created = false;

        if (!dealId) {
            const categoryCode =
                dto.categoryCode ?? PbxDealCategoryCodeEnum.sales_base;
            const category = PortalModel.getDealCategoryByCode(categoryCode);
            if (!category) {
                throw new BadRequestException(
                    `На портале ${dto.domain} нет воронки сделок "${categoryCode}"`,
                );
            }

            const createFields: Partial<IBXDeal> = {
                TITLE: dto.dealName ?? '',
                CATEGORY_ID: category.bitrixId,
                OPENED: dto.opened === false ? 'N' : 'Y',
            };
            if (dto.userId) {
                createFields.ASSIGNED_BY_ID = String(dto.userId);
            }
            if (dto.companyId) {
                createFields.COMPANY_ID = String(dto.companyId);
            }

            const response = await bitrix.deal.set(createFields);
            dealId = Number(response.result);
            created = true;

            if (!dealId) {
                throw new BadRequestException(
                    `Bitrix не создал сделку на портале ${dto.domain}`,
                );
            }
        }

        const job: DealSendJobDto = {
            domain: dto.domain,
            dealId,
            fields,
            productRows: dto.productRows
                ? resolver.resolveProductRows(dto.productRows)
                : undefined,
        };

        await this.dispatcher.dispatch(
            QueueNames.KONSTRUCTOR,
            JobNames.KONSTRUCTOR_DEAL_SEND,
            job,
        );

        return { dealId, created, skipped };
    }
}
