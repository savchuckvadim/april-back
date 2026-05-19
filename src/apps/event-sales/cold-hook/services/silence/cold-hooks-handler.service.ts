import { PBXService } from '@/modules/pbx/pbx.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { IColdHookSilenceHandlerData } from '../../type/cold-hook-silence.interface';
import { EnumColdCallEntityType } from '../../dto/cold.dto';
import { ColdCallUseCase } from '../../use-cases/cold-call.use-case';
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { getErrorDetails } from '@/shared';

/**
 * Обрабатывает множество хуков
 *
 */
@Injectable()
export class ColdHooksHandlerService {
    private readonly logger = new Logger(ColdHooksHandlerService.name);

    constructor(private readonly pbx: PBXService) {
        this.logger.log('Cold Hooks Silence Handler initialized');
    }

    async handleHooks(
        domain: string,
        hooks: IColdHookSilenceHandlerData['collected'],
    ): Promise<void> {
        try {
            this.logger.log('hooks', hooks);
            this.logger.log('domain', domain);
            if (!hooks || Object.keys(hooks).length === 0) {
                this.logger.log('No Cold Hooks to create');
                return;
            }
            const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
            const useCase = new ColdCallUseCase(bitrix, PortalModel);

            const companies = await this.getCompanies(bitrix, hooks);
            //todo переделать добавить сделки тоже если запускалось из сделко
            // const deals = await bitrix.deal.getList({
            //     filter: { ID: { IN: dealsIds } },
            //     select: ['ID', 'TITLE'],
            // });

            if (portal) {
                this.logger.log(domain);

                for (const [_, raw] of Object.entries(hooks)) {
                    const currentCompany: IBXCompany = companies.find(
                        (company: IBXCompany) =>
                            Number(company.ID) === Number(raw.entityId),
                    ) as IBXCompany;
                    this.logger.log(
                        'currentCompany',
                        currentCompany.ID ?? 'null',
                        'raw',
                        raw,
                    );
                    await useCase.flow(raw, currentCompany, null, null);
                }
                this.logger.log('hooks', hooks);
                const result = await bitrix.api.callBatchWithConcurrency(2);
                this.logger.log(`Batch result: ${JSON.stringify(result)}`);
                return;
            }
            throw new HttpException(
                'Cold hook portal notfound for domain: ' + domain,
                HttpStatus.BAD_REQUEST,
            );
        } catch (err) {
            const { message, stack } = getErrorDetails(err);
            this.logger.error(
                'Error in Cold Hooks Silence Handler Service',
                message,
            );
            this.logger.error(stack);
        }
    }
    private async getCompanies(
        bitrix: BitrixService,
        hooks: IColdHookSilenceHandlerData['collected'],
    ): Promise<IBXCompany[]> {
        const companiesIds: number[] = [];
        const dealsIds: number[] = [];

        for (const key in hooks) {
            const hook = hooks[key];
            if (hook.entityType === EnumColdCallEntityType.COMPANY) {
                companiesIds.push(Number(hook.entityId));
            } else if (hook.entityType === EnumColdCallEntityType.DEAL) {
                dealsIds.push(Number(hook.entityId));
            }
        }
        this.logger.log('companiesIds', companiesIds);
        this.logger.log('dealsIds', dealsIds);
        companiesIds.map(id => {
            bitrix.batch.company.get(`company_${id}`, id, ['ID', 'TITLE']);
        });
        const result = await bitrix.api.callBatchWithConcurrency(1);
        const companies = this.prepareBatchResults<IBXCompany>(result);

        return companies;
    }

    private prepareBatchResults<T extends IBXCompany | IBXDeal>(
        results: IBitrixBatchResponseResult[],
    ): T[] {
        const entities: T[] = [];
        for (const chunk of results) {
            for (const key in chunk.result) {
                const entity = chunk.result[key] as T;
                entities.push(entity);
            }
        }
        return entities;
    }
}
