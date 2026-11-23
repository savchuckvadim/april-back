import { Injectable } from '@nestjs/common';
import { OfferRenderInput } from '../../types/offer-render-input.type';
import {
    ComplectDto,
    OfferComplectsModeEnum,
} from '../../../document-generate';
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

/**
 * Наполнение одного комплекта общего набора: заголовок раздела и тот же набор
 * полей наполнения, что на верхнем уровне данных, но по группам этого комплекта.
 */
export interface IComplectSectionRenderData extends IInfoblocksRenderData {
    /** Название комплекта */
    ComplectTitle: string;
    /** Подпись поставки комплекта; пусто, если не передана */
    ComplectSupplyName: string;
}

/**
 * Наполнение по комплектам. Поля есть, только если в запросе пришёл список
 * `complects`: запрос без него даёт те же данные, что и раньше.
 */
export interface IComplectSectionsRenderData {
    /** По элементу на комплект из `complects`; заполнен при любом режиме печати */
    ComplectSections?: IComplectSectionRenderData[];
    /**
     * Наполнение печатается по комплектам: режим `separate` и два комплекта
     * или больше. Word-шаблон выбирает им блок «по комплектам» или «одним списком».
     */
    IsComplectsSeparate?: boolean;
}

/** Меньше комплектов нет смысла делить на разделы */
const MIN_SEPARATE_COMPLECTS = 2;

@Injectable()
export class OfferRenderInfoblocksService {
    constructor(
        private readonly infoblocksRenderDataService: InfoblocksRenderDataService,
    ) {}

    async renderInfoblocks(
        dto: OfferRenderInput,
    ): Promise<IInfoblocksRenderData & IComplectSectionsRenderData> {
        const complect = dto.complect;
        // const infoblocks = await this.getComplectInfoblocks(complect);

        const renderData = await this.renderComplectInfoblocks(complect);
        const sections = await this.renderComplectSections(dto);
        return { ...renderData, ...sections };
    }

    /**
     * Наполнение каждого комплекта из `complects` — тем же сервисом, что и
     * объединённое наполнение верхнего уровня.
     */
    private async renderComplectSections(
        dto: OfferRenderInput,
    ): Promise<IComplectSectionsRenderData> {
        const complects = dto.complects ?? [];
        if (complects.length === 0) return {};

        const sections = await Promise.all(
            complects.map(
                async (section): Promise<IComplectSectionRenderData> => ({
                    ComplectTitle: section.title,
                    ComplectSupplyName: section.supplyName ?? '',
                    ...(await this.renderComplectInfoblocks(
                        section.complect ?? [],
                    )),
                }),
            ),
        );
        return {
            ComplectSections: sections,
            IsComplectsSeparate:
                dto.complectsMode === OfferComplectsModeEnum.SEPARATE &&
                complects.length >= MIN_SEPARATE_COMPLECTS,
        };
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
