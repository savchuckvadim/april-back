import { ComplectDto } from '../../dto';
import { IInfblockRenderData } from '../infoblock-render-data.service';
import { getRegionInfoblockData } from './region-infoblock.util';

export const getRegionsWithDescriptionData = (
    complect: ComplectDto[],
): IInfblockRenderData => {
    const { totalRegionsBlocks } = getRegionInfoblockData(complect);
    const regionsDescription = totalRegionsBlocks
        .map(region => region.title || region.name)
        .join(', ');

    return {
        name: 'Региональное законодательство',
        infoblock: regionsDescription,
        smallDescription: regionsDescription,
        mediumDescription: regionsDescription,
        bigDescription: regionsDescription,
    };
};
