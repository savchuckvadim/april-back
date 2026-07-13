import { Injectable } from '@nestjs/common';
import { ComplectDto, RegionsDto } from '../dto';
import { getRegionInfoblockData } from './utils/region-infoblock.util';

@Injectable()
export class DocumentInfoblockService {
    getInfoblocks(complect: ComplectDto[], regions: RegionsDto) {
        const regionsNames = this.getRegions(regions);
        const { infoblocksLeft, infoblocksRight } = this.getLeftRightInfoblocks(
            complect,
            regionsNames,
        );
        return { infoblocksLeft, infoblocksRight };
    }

    private getLeftRightInfoblocks(complect: ComplectDto[], regions: string[]) {
        const infoblocksLeft: string[] = [];
        const infoblocksRight: string[] = [];
        const infoblocks: string[] = [];
        let isRegionProcessed = false;
        const { hasRootRegion } = getRegionInfoblockData(complect);
        complect.forEach(iData => {
            iData.value.forEach((iBlock, index) => {
                if (
                    iBlock.code === 'reg' ||
                    (!isRegionProcessed && !hasRootRegion && index === 0)
                ) {
                    regions.map(regionName => infoblocks.push(regionName));
                    isRegionProcessed = true;
                } else {
                    if (iBlock.checked) {
                        infoblocks.push(iBlock.title || iBlock.name);
                    }
                }
            });
        });
        infoblocks.forEach((iblockName, index) => {
            if (index < infoblocks.length / 2) {
                infoblocksLeft.push(iblockName);
            } else {
                infoblocksRight.push(iblockName);
            }
        });

        return { infoblocksLeft, infoblocksRight };
    }
    private getRegions(regions: RegionsDto): string[] {
        const resultRegions: string[] = [];
        [regions.inComplect, regions.favorite, regions.noWidth].map(region => {
            region.forEach(r => {
                resultRegions.push(r.infoblock);
            });
        });
        return resultRegions;
    }
}
