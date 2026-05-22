import { Injectable } from '@nestjs/common';
import { IOfferWordGenerateManagerDto } from '../../dto/offer-word-generate-request.dto';

export interface IOfferRenderManagerData {
    ManagerName: string;
    ManagerPosition: string;
    ManagerEmail: string;
    ManagerPhone: string;
}

@Injectable()
export class OfferRenderManagerService {
    constructor() {}

    public getData(dto: IOfferWordGenerateManagerDto): IOfferRenderManagerData {
        return {
            ManagerName: dto.name ?? '',
            ManagerPosition: dto.position ?? '',
            ManagerEmail: dto.email ?? '',
            ManagerPhone: dto.phone ?? '',
        };
    }
}
