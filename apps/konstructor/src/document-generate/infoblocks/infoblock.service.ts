import { Injectable } from '@nestjs/common';
import { ComplectDto, RegionsDto } from '../dto';
import {
    getRegionInfoblockData,
    REGION_INFOBLOCK_CODE,
} from './utils/region-infoblock.util';

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

    /**
     * Список инфоблоков договора в две колонки. Регионы берутся из корзин
     * (inComplect, favorite, noWidth) и встают на место корневого блока
     * «Региональное законодательство» (reg), а без него — в начало списка.
     *
     * Блоки isRegion из состава — те же регионы, их шлют для КП и для
     * спецификации (там нужны их веса). Когда корзины не пусты, в списке
     * договора регионы уже есть, и блоки isRegion второй раз не печатаются:
     * раньше при двух регионах и больше дополнительные выходили дважды.
     * Без корня первый блок первой группы больше не пропадает: раньше на его
     * место вставлялись регионы, а сам блок терялся.
     */
    private getLeftRightInfoblocks(complect: ComplectDto[], regions: string[]) {
        const infoblocksLeft: string[] = [];
        const infoblocksRight: string[] = [];
        const { hasRootRegion } = getRegionInfoblockData(complect);
        const regionsFromBaskets = regions.length > 0;
        const infoblocks: string[] = hasRootRegion ? [] : [...regions];
        for (const group of complect) {
            for (const block of group.value) {
                if (block.code === REGION_INFOBLOCK_CODE) {
                    infoblocks.push(...regions);
                    continue;
                }
                if (block.isRegion && regionsFromBaskets) continue;
                if (block.checked) {
                    infoblocks.push(block.title || block.name);
                }
            }
        }
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
