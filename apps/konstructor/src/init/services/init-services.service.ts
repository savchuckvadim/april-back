import { Injectable } from '@nestjs/common';
import { ComplectEntity, ComplectService } from '@lib/garant';
import { ComplectProductTypeEnum } from '@lib/garant/complect/types/complect.type';
import { PackageService } from '@lib/garant/package';
import { PackageEntityDto } from '@lib/garant/package/dto/package-entity.dto';
import { PackageProductTypeEnum } from '@lib/garant/package/types/package.type';

/**
 * Дополнительные сервисы конструктора: продукты и пакеты Legal Tech,
 * консалтинг, СТАР. Живут в таблицах complects и garant_packages,
 * различаются по productType — здесь собираются в единый блок init.
 */
export interface IKServiceItem {
    id: number;
    code: string;
    name: string;
    fullName: string;
    shortName: string;
    number: number;
    weight: number;
    abs: number | null;
    color: string | null;
    productType: string;
    /** true — элемент из garant_packages (пакет), false — из complects (продукт) */
    isPackage: boolean;
}

export interface IKServices {
    lt: IKServiceItem[];
    ltPackages: IKServiceItem[];
    consalting: IKServiceItem[];
    star: IKServiceItem[];
}

@Injectable()
export class InitServicesService {
    constructor(
        private readonly complectService: ComplectService,
        private readonly packageService: PackageService,
    ) {}

    async get(): Promise<IKServices> {
        const complects = (await this.complectService.findAll()) || [];
        const packages = (await this.packageService.findAll()) || [];

        return {
            lt: this.fromComplects(complects, ComplectProductTypeEnum.LT),
            ltPackages: this.fromPackages(packages, PackageProductTypeEnum.LT),
            consalting: [
                ...this.fromComplects(
                    complects,
                    ComplectProductTypeEnum.CONSALING,
                ),
                ...this.fromPackages(
                    packages,
                    PackageProductTypeEnum.CONSALING,
                ),
            ],
            star: [
                ...this.fromComplects(complects, ComplectProductTypeEnum.STAR),
                ...this.fromPackages(packages, PackageProductTypeEnum.STAR),
            ],
        };
    }

    private fromComplects(
        complects: ComplectEntity[],
        productType: ComplectProductTypeEnum,
    ): IKServiceItem[] {
        return complects
            .filter(complect => complect.productType === productType)
            .map(complect => ({
                id: Number(complect.id),
                code: complect.code || '',
                name: complect.name || '',
                fullName: complect.fullName || '',
                shortName: complect.shortName || '',
                number: complect.number || 0,
                weight: complect.weight || 0,
                abs: this.getAbs(complect.abs),
                color: complect.color || null,
                productType,
                isPackage: false,
            }));
    }

    private fromPackages(
        packages: PackageEntityDto[],
        productType: PackageProductTypeEnum,
    ): IKServiceItem[] {
        return packages
            .filter(pkg => pkg.productType === productType)
            .map(pkg => ({
                id: Number(pkg.id),
                code: pkg.code || '',
                name: pkg.name || '',
                fullName: pkg.fullName || '',
                shortName: pkg.shortName || '',
                number: pkg.number || 0,
                weight: pkg.weight || 0,
                abs: this.getAbs(pkg.abs),
                color: pkg.color || null,
                productType,
                isPackage: true,
            }));
    }

    private getAbs(abs: string | number | undefined | null): number | null {
        if (abs === undefined || abs === null || abs === '') return null;
        const parsed = Number(abs);
        return Number.isFinite(parsed) ? parsed : null;
    }
}
