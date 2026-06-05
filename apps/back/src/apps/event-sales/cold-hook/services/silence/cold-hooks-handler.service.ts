import { PBXService } from '@/modules/pbx/pbx.service';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { IColdHookSilenceHandlerData } from '../../type/cold-hook-silence.interface';
import { ColdCallUseCase } from '../../use-cases/cold-call.use-case';
import { IBXCompany } from '@/modules/bitrix';
import { getErrorDetails } from '@/shared';

import { PreColdDealFlowService } from '../enities/deal/pre-cold-deals-flow.service';
import { PreColdEntitiesFlowService } from '../enities/entity/pre-cold-entities.flow.service';
import { PreColdTasksFlowService } from '../enities/task/pre-cold-tasks.flow.service';
import { ColdHookBatchGroupBuffer } from '../batch/cold-hook-batch-group-buffer';

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
            this.logger.log('hooks');
            if (!hooks || Object.keys(hooks).length === 0) {
                this.logger.log('No Cold Hooks to create');
                return;
            }
            const { bitrix, portal, PortalModel } = await this.pbx.init(domain);
            const entitiesService = new PreColdEntitiesFlowService(bitrix);
            const preColdDealFlowService = new PreColdDealFlowService(
                PortalModel,
                bitrix,
            );
            const tasksService = new PreColdTasksFlowService(
                PortalModel,
                bitrix,
            );
            const useCase = new ColdCallUseCase(PortalModel, bitrix);

            /**
             * Берем все компании для хуков
             *
             */
            const { companies, companiesIds } =
                await entitiesService.getPreColdEntities(hooks);

            /**
             * Закрываем все сделки перед созданием новых
             * пока что заккоментил - отключил
             */
            const closedDealsResult =
                await preColdDealFlowService.execute(companies);

            /**
             * закрыть задачи

             */

            await tasksService.closeTasks(companiesIds);

            if (portal) {
                /**
                 * Каждая компания = одна атомарная группа batch-команд.
                 * Буфер гарантирует, что все команды одной компании уходят
                 * в один HTTP-batch (≤50) — $result[cmdKey] работает между
                 * сделкой → задачей → элементом списка.
                 */
                const buffer = new ColdHookBatchGroupBuffer(bitrix);

                for (const raw of Object.values(hooks)) {
                    const currentEntityData = closedDealsResult?.find(
                        c => Number(c.company.ID) === Number(raw.entityId),
                    );
                    const currentCompany =
                        currentEntityData?.company as IBXCompany;
                    const baseDeal = currentEntityData?.baseDeal ?? null;

                    await useCase.flow(
                        raw,
                        currentCompany,
                        baseDeal,
                        null,
                        buffer,
                    );
                }

                await buffer.flush();

                return;
            } else {
                throw new HttpException(
                    'Cold hook portal notfound for domain: ' + domain,
                    HttpStatus.BAD_REQUEST,
                );
            }
        } catch (err) {
            const { message, stack } = getErrorDetails(err);
            this.logger.error(
                'Error in Cold Hooks Silence Handler Service',
                message,
            );
            this.logger.error(stack);
        }
    }
}
