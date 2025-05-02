// report-kpi.service.ts
import { Injectable, Logger } from '@nestjs/common';

import { PortalProviderService } from 'src/modules/portal/services/portal-provider.service';
import { BitrixApiService } from 'src/modules/bitrix/core/http/bitrix-api.service';
import { GetCallingStatisticFiltersDto } from '../dto/calling-statistic.dto';
import { CALLING_TYPES, CallingDuration, ICallingStatisticResult, VoximplantFilter } from '../types/calling-statistic.type';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { IBitrixBatchResponseResult } from 'src/modules/bitrix/core/interface/bitrix-api.intterface';

@Injectable()
export class CallingStatisticUseCase {

    // private bitrixApi: BitrixApiService;

    constructor(

        private readonly bitrixApi: BitrixApiService,
        // private readonly portalContext: PortalContextService,
        private readonly portalProvider: PortalProviderService,
    ) { }

    // async init(
    //     // domain: string
    // ) {

    //     const portalModel = await this.portalProvider.getModelFromRequest();
    //     const portal = portalModel.getPortal();

    //     if (!portal) throw new Error('Portal not found');



    //     // this.bitrixApi = this.bitrixContext.getApi();



    // }

    async get(dto: GetCallingStatisticFiltersDto): Promise<ICallingStatisticResult[]> {

        const { departament: users, dateFrom, dateTo } = dto;

        const callingsTypes = CALLING_TYPES.map((type) => ({
            ...type,
            count: 0,

        }));

        const method = 'voximplant.statistic.get';



        for (const user of users) {
            const userId = user.ID;
            const resultUserReport = {
                user,
                userName: user.NAME,
                callings: JSON.parse(JSON.stringify(callingsTypes)), // deep clone
            };

            callingsTypes.forEach(type => {
                const filter: any = this.buildVoximplantFilter(
                    userId,
                    dateFrom,
                    dateTo,
                    type.id
                )
                const key = `${method}_${type.id}_${userId}`
                const data = {
                    'FILTER': filter,
                }
                Logger.log(filter)
                this.bitrixApi.addCmdBatch(key, method, data)
            })



        }
        const response = await this.bitrixApi.callBatchWithConcurrency(2)
        const result = this.getFormedResults(response, users, method)

        return result;

    }

    private buildVoximplantFilter = (
        userId: number,
        dateFrom: string,
        dateTo: string,
        duration: CallingDuration,
    ): VoximplantFilter => {
        const filter: VoximplantFilter = {
            PORTAL_USER_ID: userId,
            '>CALL_START_DATE': dateFrom,
            '<CALL_START_DATE': dateTo,
        };

        if (duration !== 'all') {
            filter['>CALL_DURATION'] = duration;
        }

        return filter;
    }

    private getFormedResults = (
        results: IBitrixBatchResponseResult[],
        departament: IBXUser[],
        method: string,
    ) => {
        const result: ICallingStatisticResult[] = [];
        for (const user of departament) {
            const userId = user.ID;
            const resultUserReport = {
                user,
                userName: user.NAME,
                callings: [] // JSON.parse(JSON.stringify(callingsTypes)), // deep clone
            } as ICallingStatisticResult;

            CALLING_TYPES.forEach(type => {

                const cmdkey = `${method}_${type.id}_${userId}`

                results.forEach(res => {

                    for (const key in res.result_total) {

                        if (key === cmdkey) {
                            const calling = {
                                id: type.id,
                                action: type.action,
                                count: Number(res.result_total[key]),
                                duration: 0
                            }
                            resultUserReport.callings.push(calling)
                        }
                    }

                })

            })



            result.push(resultUserReport);
        }
        return result;
    }
}
