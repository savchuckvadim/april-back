import { Injectable } from '@nestjs/common';
import { OfferRenderInput } from '../../types/offer-render-input.type';
import {
    ComplectDto,
    OfferComplectSectionDto,
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

/**
 * Наполнение одного набора для сравнения: номер и заголовок набора из таблицы
 * цен и разделы его комплектов.
 */
export interface IAlternativeComplectSectionRenderData {
    /** Номер набора для сравнения (от 1) — тот же, что `ProductSetNumber` у строк цен */
    AlternativeSetNumber: number;
    /** Заголовок набора — тот же, что `ProductSetTitle` у строк цен, например «Набор 1» */
    AlternativeSetTitle: string;
    /**
     * Комплекты набора: по элементу на комплект, поля те же, что у
     * `ComplectSections` общего набора. Внутри цикла по наборам Word-шаблон
     * видит именно их, поэтому блок «комплект и его наполнение» переносится из
     * общего набора без правок.
     */
    ComplectSections: IComplectSectionRenderData[];
}

/**
 * Наполнение наборов для сравнения. Поля есть, только если в запросе пришёл
 * непустой `alternativeComplects` хотя бы с одним комплектом: запрос без него
 * даёт те же данные, что и раньше.
 */
export interface IAlternativeComplectsRenderData {
    /** По элементу на набор для сравнения, в порядке запроса; наборы без комплектов пропущены */
    AlternativeComplectSections?: IAlternativeComplectSectionRenderData[];
    /** Есть что печатать в блоке «Наполнение наборов для сравнения»; Word-шаблон выбирает им весь блок */
    IsAlternativeComplects?: boolean;
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
    ): Promise<
        IInfoblocksRenderData &
            IComplectSectionsRenderData &
            IAlternativeComplectsRenderData
    > {
        const complect = dto.complect;
        // const infoblocks = await this.getComplectInfoblocks(complect);

        const renderData = await this.renderComplectInfoblocks(complect);
        const sections = await this.renderComplectSections(dto);
        const alternatives = await this.renderAlternativeComplects(dto);
        return { ...renderData, ...sections, ...alternatives };
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

        return {
            ComplectSections: await this.renderSections(complects),
            IsComplectsSeparate:
                dto.complectsMode === OfferComplectsModeEnum.SEPARATE &&
                complects.length >= MIN_SEPARATE_COMPLECTS,
        };
    }

    /**
     * Наполнение наборов для сравнения из `alternativeComplects`: комплекты
     * каждого набора считаются так же, как комплекты общего набора. Набор без
     * комплектов в данные не попадает, чтобы шаблон не печатал пустой заголовок.
     */
    private async renderAlternativeComplects(
        dto: OfferRenderInput,
    ): Promise<IAlternativeComplectsRenderData> {
        const sets = (dto.alternativeComplects ?? []).filter(
            set => (set.complects ?? []).length > 0,
        );
        if (sets.length === 0) return {};

        // наборы идут по очереди, комплекты набора — параллельно: запросов
        // к каталогу инфоблоков не больше, чем у общего набора с таким же числом комплектов
        const sections: IAlternativeComplectSectionRenderData[] = [];
        for (const set of sets) {
            sections.push({
                AlternativeSetNumber: set.setNumber,
                AlternativeSetTitle: set.title,
                ComplectSections: await this.renderSections(set.complects),
            });
        }
        return {
            AlternativeComplectSections: sections,
            IsAlternativeComplects: true,
        };
    }

    /** Раздел на каждый комплект: заголовок, подпись поставки и наполнение по его группам */
    private renderSections(
        complects: readonly OfferComplectSectionDto[],
    ): Promise<IComplectSectionRenderData[]> {
        return Promise.all(
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
