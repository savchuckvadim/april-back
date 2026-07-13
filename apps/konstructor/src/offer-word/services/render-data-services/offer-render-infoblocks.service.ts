import { Injectable } from '@nestjs/common';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { ComplectDto } from '../../../document-generate';
import {
    IInfblockGroupsRenderData,
    IInfblockGroupsSeparatedRenderData,
    IInfblockRenderData,
    InfoblocksRenderDataService,
} from '../../../document-generate/infoblocks/infoblock-render-data.service';

export interface IInfoblocksRenderData
    extends IInfblockGroupsSeparatedRenderData {
    infoblocksByGroups: IInfblockGroupsRenderData[];

    simpleInfoblocks: IInfblockRenderData[];
    simpleInfoblocksByColumns: {
        columnOne: IInfblockRenderData[];
        columnTwo: IInfblockRenderData[];
    }[];
}
@Injectable()
export class OfferRenderInfoblocksService {
    constructor(
        private readonly infoblocksRenderDataService: InfoblocksRenderDataService,
    ) {}

    async renderInfoblocks(
        dto: OfferWordByTemplateGenerateDto,
    ): Promise<IInfoblocksRenderData> {
        const complect = dto.complect;
        // const infoblocks = await this.getComplectInfoblocks(complect);

        const renderData = await this.renderComplectInfoblocks(complect);
        return renderData;
    }

    private async renderComplectInfoblocks(
        complect: ComplectDto[],
    ): Promise<IInfoblocksRenderData> {
        const renderDataByGroups =
            await this.infoblocksRenderDataService.getInfoblocksByGroupsData(
                complect,
            );
        const simpleInfoblocksRenderData =
            await this.infoblocksRenderDataService.getSimpleInfoblocksData(
                complect,
            );
        const simpleInfoblocksByColumnsRenderData =
            await this.infoblocksRenderDataService.getSimpleByColumnsQuantityData(
                complect,
                2,
            );
        const separatedRenderData =
            await this.infoblocksRenderDataService.getGroupsSeparatedData(
                complect,
            );

        return {
            infoblocksByGroups: renderDataByGroups,
            simpleInfoblocks: simpleInfoblocksRenderData,
            simpleInfoblocksByColumns: [
                {
                    columnOne: simpleInfoblocksByColumnsRenderData[0],
                    columnTwo: simpleInfoblocksByColumnsRenderData[1],
                },
            ],
            ...separatedRenderData,
        };
    }
}
