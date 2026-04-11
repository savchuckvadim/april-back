import { InfoblockEntity, InfoblockService } from '@/modules/garant/infoblock';
import { Injectable } from '@nestjs/common';
import { ComplectDto } from '../dto';
import { getRegionInfoblockData } from './utils/region-infoblock.util';
import { getRegionsWithDescriptionData } from './utils/region-with-description-render-data.util';
import { INFOBLOCK_GROUP_TYPE } from '../dto/complect/complect.type';

export interface IInfblockRenderData {
    name: string;
    infoblock: string;
    smallDescription: string;
    mediumDescription: string;
    bigDescription: string;
}
export interface IInfblockGroupsRenderData {
    groupsName: string;
    infoblocks: IInfblockRenderData[];
}

export interface IInfblockGroupsSeparatedRenderData {
    NPA: IInfblockRenderData[];
    Comments: IInfblockRenderData[];
    CaseLaw: IInfblockRenderData[];
    Free: IInfblockRenderData[];
    Special: IInfblockRenderData[];
    STAR: IInfblockRenderData[];
    Academy: IInfblockRenderData[];
    Consalting: IInfblockRenderData[];

    PacketsEr: string[];
    Ers: IInfblockRenderData[];

    FreeBlocks: IInfblockRenderData[];
    LegalTech: IInfblockRenderData[];
}

@Injectable()
export class InfoblocksRenderDataService {
    constructor(private readonly infoblockService: InfoblockService) {}

    public async getInfoblocksByGroupsData(
        complect: ComplectDto[],
    ): Promise<IInfblockGroupsRenderData[]> {
        const { totalPreparedGroupsWithoutRegions } =
            getRegionInfoblockData(complect);
        const infoblocks = await this.getComplectInfoblocks(
            totalPreparedGroupsWithoutRegions,
        );

        const renderDataByGroups = this.getWithDescriptionByGroupsListData(
            complect,
            infoblocks,
        );

        return renderDataByGroups;
    }
    public async getGroupsSeparatedData(
        complect: ComplectDto[],
    ): Promise<IInfblockGroupsSeparatedRenderData> {
        const { totalPreparedGroupsWithoutRegions } =
            getRegionInfoblockData(complect);
        const infoblocks = await this.getComplectInfoblocks(
            totalPreparedGroupsWithoutRegions,
        );

        const renderDataByGroups = this.getWithDescriptionByGroupsSeparatedData(
            complect,
            infoblocks,
        );
        return renderDataByGroups;
    }

    public async getSimpleInfoblocksData(
        complect: ComplectDto[],
    ): Promise<IInfblockRenderData[]> {
        const renderDataByGroups =
            await this.getInfoblocksByGroupsData(complect);
        const renderData: IInfblockRenderData[] = [];
        renderDataByGroups.forEach(group => {
            renderData.push(...group.infoblocks);
        });
        return renderData;
    }

    public async getSimpleByColumnsQuantityData(
        complect: ComplectDto[],
        columnsQuantity: number,
    ): Promise<IInfblockRenderData[][]> {
        const renderData = await this.getSimpleInfoblocksData(complect);
        const safeColumnsQuantity = Math.max(1, columnsQuantity);
        const renderDataByColumns: IInfblockRenderData[][] = Array.from(
            { length: safeColumnsQuantity },
            () => [],
        );

        const columnSize = Math.ceil(renderData.length / safeColumnsQuantity);
        for (let i = 0; i < safeColumnsQuantity; i += 1) {
            const start = i * columnSize;
            const end = start + columnSize;
            renderDataByColumns[i] = renderData.slice(start, end);
        }

        return renderDataByColumns;
    }
    private async getComplectInfoblocks(
        complect: ComplectDto[],
    ): Promise<InfoblockEntity[]> {
        const complectCodes = complect.map(group =>
            group.value.map(value => value.code),
        );

        const infoblocks = await this.infoblockService.getInfoblocksByCodse(
            complectCodes
                .flat()
                .filter(
                    (code): code is string =>
                        code !== undefined && code !== 'reg',
                ),
        );
        return infoblocks || [];
    }

    private getWithDescriptionByGroupsListData(
        complect: ComplectDto[],
        infoblocks: InfoblockEntity[],
    ): IInfblockGroupsRenderData[] {
        const renderData: IInfblockGroupsRenderData[] = [];
        const { hasAnyRegion, totalPreparedGroupsWithoutRegions } =
            getRegionInfoblockData(complect);
        let isRegionsProcessed = false;

        totalPreparedGroupsWithoutRegions.forEach((group, groupIndex) => {
            const groupName = group.groupsName;
            const infoblocksData: IInfblockRenderData[] = [];

            // const type = group.type;

            group.value.map((value, valueIndex) => {
                const infoblock = infoblocks.find(
                    infoblock => infoblock.code === value.code,
                );
                const resultInfoblock = {
                    infoblock:
                        infoblock?.name === 'Региональное законодательство'
                            ? infoblock?.shortDescription || ''
                            : infoblock?.name ||
                              value.title ||
                              value.name ||
                              '',
                    name: infoblock?.name || value.title || value.name || '',
                    smallDescription:
                        infoblock?.shortDescription || value.description || '',
                    mediumDescription:
                        infoblock?.descriptionForSale ||
                        value.description ||
                        '',
                    bigDescription:
                        infoblock?.description || value.description || '',
                };
                if (resultInfoblock.name) {
                    infoblocksData.push(resultInfoblock);
                }

                const firstBlock = groupIndex === 0 && valueIndex === 0;
                const needRegionData =
                    firstBlock && hasAnyRegion && !isRegionsProcessed;

                if (needRegionData) {
                    isRegionsProcessed = true;
                    
                    infoblocksData.push(
                        getRegionsWithDescriptionData(complect),
                    );
                }
            });
            renderData.push({
                groupsName: groupName,
                infoblocks: infoblocksData,
            });
        });
        return renderData;
    }

    private getWithDescriptionByGroupsSeparatedData(
        complect: ComplectDto[],
        infoblocks: InfoblockEntity[],
    ): IInfblockGroupsSeparatedRenderData {
        const renderData: IInfblockGroupsSeparatedRenderData = {
            NPA: [],
            Comments: [],
            CaseLaw: [],
            Free: [],
            Special: [],
            STAR: [],
            Academy: [],
            Consalting: [],
            PacketsEr: [],
            Ers: [],
            FreeBlocks: [],
            LegalTech: [],
        };
        const { hasAnyRegion, totalPreparedGroupsWithoutRegions } =
            getRegionInfoblockData(complect);
        let isRegionsProcessed = false;

        totalPreparedGroupsWithoutRegions.forEach((group, groupIndex) => {
            const infoblocksData: IInfblockRenderData[] = [];
            const type = group.type;

            group.value.map((value, valueIndex) => {
                const infoblock = infoblocks.find(
                    infoblock => infoblock.code === value.code,
                );
                infoblocksData.push({
                    name: infoblock?.name || '',
                    infoblock:
                        infoblock?.name === 'Региональное законодательство'
                            ? infoblock?.shortDescription || ''
                            : infoblock?.name || '',
                    smallDescription: infoblock?.shortDescription || '',
                    mediumDescription: infoblock?.descriptionForSale || '',
                    bigDescription: infoblock?.description || '',
                });

                const firstBlock = groupIndex === 0 && valueIndex === 0;
                const needRegionData =
                    firstBlock && hasAnyRegion && !isRegionsProcessed;

                if (needRegionData) {
                    isRegionsProcessed = true;
                    renderData.FreeBlocks.push(
                        getRegionsWithDescriptionData(complect),
                    );
                }
            });

            if (type === INFOBLOCK_GROUP_TYPE.ER) {
                renderData.Ers.push(...infoblocksData);

                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.PER) {
                renderData.PacketsEr.push(
                    ...group.value.map(item => item.name),
                );
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.NPA) {
                renderData.NPA.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.CONS) {
                renderData.Comments.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.LA) {
                renderData.CaseLaw.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.SP) {
                renderData.Special.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.FREE) {
                renderData.Free.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.ACADEMY) {
                renderData.Academy.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.CONSULTING) {
                renderData.Consalting.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.LT) {
                renderData.LegalTech.push(...infoblocksData);
                return;
            }

            if (type === INFOBLOCK_GROUP_TYPE.STAR) {
                renderData.STAR.push(...infoblocksData);
            }
        });
        return renderData;
    }
}
