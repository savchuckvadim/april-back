import { ComplectDto, ComplectInfoblockValueDto } from '../../dto';

export interface IRegionInfoblock {
    hasRootRegion: boolean;
    rootRegionGroup: ComplectDto | undefined;
    rootRegionInfoblockBlock: ComplectInfoblockValueDto | undefined;
    regionsFromInfoblocks: ComplectInfoblockValueDto[];
    hasDoubleRegion: boolean;
    rigionInfoblocksWithoutRootRegion: ComplectInfoblockValueDto[];
    totalRegionsBlocks: ComplectInfoblockValueDto[];
    totalPreparedGroupsWithoutRegions: ComplectDto[];
    totalPreparedGroupsWithRegions: ComplectDto[];
    hasAnyRegion: boolean;
}

export const REGION_INFOBLOCK_CODE = 'reg';

export const getRegionInfoblockData = (
    complect: ComplectDto[],
): IRegionInfoblock => {
    const isRegionBlock = (iBlock: ComplectInfoblockValueDto): boolean =>
        Boolean(iBlock.isRegion) || iBlock.code === REGION_INFOBLOCK_CODE;

    const hasRootRegion = complect.some(iData =>
        iData.value.some(iBlock => iBlock.code === REGION_INFOBLOCK_CODE),
    );

    const rootRegionGroup: ComplectDto | undefined = complect.find(iData =>
        iData.value.some(iBlock => iBlock.code === REGION_INFOBLOCK_CODE),
    );

    const rootRegionInfoblockBlock = rootRegionGroup?.value.find(
        iBlock => iBlock.code === REGION_INFOBLOCK_CODE,
    );

    //только дополнительные регионы без рутового - могут содержать в себе дубль рутового
    const regionsFromInfoblocks =
        rootRegionGroup?.value.filter(iBlock => iBlock.isRegion) ?? [];

    const hasAnyRegion = hasRootRegion || regionsFromInfoblocks.length > 0;

    //проверяем, есть ли дубль рутового региона в дополнительных регионах
    const hasDoubleRegion = regionsFromInfoblocks.some(
        region => region?.title === rootRegionInfoblockBlock?.title,
    );
    //дополнительные регионы без рутового - чистим от дубля
    const rigionInfoblocksWithoutRootRegion = regionsFromInfoblocks.filter(
        region =>
            region?.code !== REGION_INFOBLOCK_CODE &&
            region?.title !== rootRegionInfoblockBlock?.title,
    );

    //итоговые регионы без дублей но со всеми достающими
    //то есть мерджим дополнительные регионы без рутового с рутовым
    //учитывая что впринцепе и тех и других и по отдельности и вместе в теории может не быть

    const totalRegionsBlocks = [
        ...rigionInfoblocksWithoutRootRegion,
        rootRegionInfoblockBlock,
    ].filter(Boolean) as ComplectInfoblockValueDto[];

    //и также возвращаем два типа данных - точно такие же как пришли
    //1) группы без регионов

    const totalPreparedGroupsWithoutRegions = complect.map(group => {
        if (!group.value.some(isRegionBlock)) {
            return group;
        }

        const nonRegionBlocks = group.value.filter(
            iBlock => !isRegionBlock(iBlock),
        );
        const value = nonRegionBlocks;
        return {
            ...group,
            value,
        };
    });

    //2) группы с обработанными регионами без дублей и с рутовым то есть с totalRegionsBlocks в группе
    // Остальные блоки в группе и все другие группы остаются неизменными.
    const totalPreparedGroupsWithRegions = complect.map(group => {
        if (!group.value.some(isRegionBlock)) {
            return group;
        }

        const nonRegionBlocks = group.value.filter(
            iBlock => !isRegionBlock(iBlock),
        );
        const value =
            nonRegionBlocks.length > 0
                ? [
                      nonRegionBlocks[0],
                      ...totalRegionsBlocks,
                      ...nonRegionBlocks.slice(1),
                  ]
                : [...totalRegionsBlocks];
        return {
            ...group,
            value,
        };
    });
    return {
        hasRootRegion,
        rootRegionGroup,
        rootRegionInfoblockBlock,
        regionsFromInfoblocks,
        hasDoubleRegion,
        rigionInfoblocksWithoutRootRegion,
        totalRegionsBlocks, // все регионы без дублей
        totalPreparedGroupsWithoutRegions, // группы без регионов
        totalPreparedGroupsWithRegions, // группы с обработанными регионами без дублей и с рутовым то есть с totalRegionsBlocks в группе
        hasAnyRegion,
    };
};
