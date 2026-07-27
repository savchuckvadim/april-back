import {
    ComplectEntity,
    ComplectService,
    InfoblockEntity,
    InfogroupProductType,
    InfogroupService,
    InfogroupType,
} from '@lib/garant';
import { ComplectProductTypeEnum } from '@lib/garant/complect/types/complect.type';
import { Injectable } from '@nestjs/common';

export interface IComplects {
    prof: IComplect[];
    universal: IComplect[];
}
export interface IComplect {
    id: number;
    name: string;
    title: string;
    fullTitle: string;
    shortTitle: string;
    tag: string;
    className: string;
    color: string | null;
    number: number;
    weight: number;
    /** База абонентского обслуживания: цена universal = abs × region.abs × supply.coefficient */
    abs: number | null;
    withConsalting: boolean;
    withABS: boolean;
    withLt: boolean;
    withServices: boolean;
    withDefault: boolean;
    isChanging: boolean;
    productType: string;
    filling: string[]; //  "Законодательство России",...

    ers: number[];
    packetsEr: number[];
    ersInPacket: number[];
    codes: {
        filling: string[];

        ers: string[];
        packetsEr: string[];
        ersInPacket: string[];
    };
    type: 'prof' | 'universal';
}
@Injectable()
export class InitComplectService {
    constructor(
        private readonly complectService: ComplectService,
        private readonly infoGroupService: InfogroupService,
    ) {}

    async get(): Promise<IComplects | null> {
        const complects = await this.complectService.findAll();
        if (!complects) return null;

        // В таблице complects лежат и сервисы (lt/star/consalting) —
        // в prof/universal попадают только комплекты Гаранта.
        const garant = complects.filter(
            complect =>
                !complect.productType ||
                complect.productType === ComplectProductTypeEnum.GARANT,
        );

        return {
            prof: garant
                .filter(complect => complect.type === 'prof')
                .map(complect => this.getComplectItem(complect)),
            universal: garant
                .filter(complect => complect.type === 'universal')
                .map(complect => this.getComplectItem(complect)),
        };
    }

    private getComplectItem(complect: ComplectEntity): IComplect {
        if (!complect.infoblocks) {
            throw new Error(
                'Infoblocks in Complect not found' +
                    `${{
                        id: complect.id,
                        name: complect.name,
                        className: complect.code,
                    }}`,
            );
        }
        const { filling, infoblocks } = this.getFillingAndInfoblocks(
            complect.infoblocks,
        );

        return {
            id: Number(complect.id),
            name: complect.code || '',
            title: complect.name || '',
            fullTitle: complect.fullName || '',
            shortTitle: complect.shortName || '',
            tag: complect.code || '',
            className: complect.color || '',
            color: complect.color || null,
            number: complect.number || 0,
            weight: complect.weight || 0,
            abs: this.getAbs(complect.abs),
            withConsalting: complect.withConsalting || false,
            withABS: complect.withABS || false,
            withLt: complect.withLt || false,
            withServices: complect.withServices || false,
            withDefault: complect.withDefault || false,
            isChanging: complect.isChanging || false,
            productType: complect.productType || 'garant',
            type: complect.type === 'prof' ? 'prof' : 'universal',
            filling,
            ers: this.getErs(complect.infoblocks).numbers,
            packetsEr: this.getPacketsErs(complect.infoblocks).numbers,
            ersInPacket: this.getErsInPacket(complect.infoblocks).numbers,
            // lt: this.getLt(complect.infoblocks).numbers,
            // ltInPacket: this.getLtInPacket(complect.infoblocks).numbers,
            // freeBlocks: this.getFreeBlocks(complect.infoblocks).numbers,
            // consalting: this.getConsalting(complect.infoblocks).numbers,
            codes: {
                filling: infoblocks,
                ers: this.getErs(complect.infoblocks).codes,
                packetsEr: this.getPacketsErs(complect.infoblocks).codes,
                ersInPacket: this.getErsInPacket(complect.infoblocks).codes,
                // lt: this.getLt(complect.infoblocks).codes,
                // ltInPacket: this.getLtInPacket(complect.infoblocks).codes,
                // freeBlocks: this.getFreeBlocks(complect.infoblocks).codes,
                // consalting: this.getConsalting(complect.infoblocks).codes,
                // star: this.getStar(complect.infoblocks).codes,
            },
        };
    }

    private getAbs(abs: string | undefined | null): number | null {
        if (abs === undefined || abs === null || abs === '') return null;
        const parsed = Number(abs);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private getFillingAndInfoblocks(iblocks: InfoblockEntity[]): {
        filling: string[];
        infoblocks: string[];
    } {
        const filtredInfoblocks = iblocks
            .filter(iblock => !iblock.isFree)
            .filter(iblock => iblock.group?.type === InfogroupType.INFOBLOCKS)
            .filter(
                iblock =>
                    iblock.group?.productType === InfogroupProductType.GARANT,
            );

        const filling = filtredInfoblocks.map(iblock => iblock.name);
        const infoblocks = filtredInfoblocks.map(iblock => iblock.code);

        return { filling, infoblocks };
    }

    private getErs(iblocks: InfoblockEntity[]): {
        numbers: number[];
        codes: string[];
    } {
        const filtredInfoblocks = iblocks.filter(
            iblock => iblock.group?.type === InfogroupType.ER,
        );
        const numbers = filtredInfoblocks.map(iblock => iblock.number);
        const codes = filtredInfoblocks.map(iblock => iblock.code);

        return { numbers, codes };
    }

    private getPacketsErs(iblocks: InfoblockEntity[]): {
        numbers: number[];
        codes: string[];
    } {
        const filtredInfoblocks = iblocks
            .filter(iblock => !iblock.isFree)
            .filter(iblock => iblock.group?.code === 'per');

        const numbers = filtredInfoblocks.map(iblock => iblock.number);
        const codes = filtredInfoblocks.map(iblock => iblock.code);

        return { numbers, codes };
    }

    private getErsInPacket(iblocks: InfoblockEntity[]): {
        numbers: number[];
        codes: string[];
    } {
        const numbers = [] as number[];
        const codes = [] as string[];
        const filtredInfoblocks = iblocks.filter(
            iblock => iblock.group?.code === 'per',
        );

        filtredInfoblocks.map(iblock => {
            iblock.packageInfoblocks &&
                iblock.packageInfoblocks.map((piblock: InfoblockEntity) => {
                    numbers.push(piblock.number);
                    codes.push(piblock.code);
                });
        });

        return { numbers, codes };
    }
}
