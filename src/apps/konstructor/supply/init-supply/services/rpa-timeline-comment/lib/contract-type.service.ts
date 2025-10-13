import { Injectable } from '@nestjs/common';

import { InitSupplyDto } from '../../../dto/init-supply.dto';
import { CONTRACT_LTYPE } from '@/apps/konstructor/document-generate/type/contract.type';

export class ContractTypeService {
    static getContractTypeName(dto: InitSupplyDto): string {
        const contractTypeCode = dto.contractType;
        const contractTypeName =
            contractTypeCode === CONTRACT_LTYPE.ABON
                ? 'Абонемент'
                : contractTypeCode === CONTRACT_LTYPE.LIC
                  ? 'Договор Лицензионный'
                  : 'Договор Услуг';
        return contractTypeName || '';
    }
}
