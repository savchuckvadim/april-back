import { Injectable } from "@nestjs/common";
import { ContractSpecificationDto } from "@/apps/konstructor/document-generate/dto/specification/specification.dto";

@Injectable()
export class ContractSpecificationService {

    constructor(

    ) {}


  

    public getSpecification(domain: string, specification: ContractSpecificationDto) {
        let infoblocks = '';
        let lt = '';
        let supplyContract = '';
        let licLong = '';
        let loginsQuantity = '';
        let contractInternetEmail = '_____________________________________________________';
        let supplyComment = '';
        let specification_pk = '';
        let specification_pk_comment1 = '';
        let specification_pk_comment = '';
        let complect_name = '';
        let specification_email_comment = '';
        let specification_services = '';
        let specification_distributive = '';
        let specification_distributive_comment = '';
        let specification_dway = '';
        let specification_dway_comment = '';

        for (const value of specification.items) {
            if (domain === 'april-garant.bitrix24.ru') {
                if (value.code === 'specification_ibig' || value.code === 'specification_ismall') {
                    infoblocks += value.value + '\n';
                }
            } else {
                if (value.code === 'specification_iblocks') {
                    infoblocks += value.value + '\n';
                }
            }

            if (value.code === 'complect_name') {
                complect_name = domain !== 'gsr.bitrix24.ru' ? `\n${value.value}\n` : value.value as string;
            }

            if (['specification_ers', 'specification_ers_packets', 'specification_ers_in_packets', 'specification_ifree'].includes(value.code)) {
                infoblocks += value.value + '\n';
            }

            if (value.code === 'specification_services') {
                specification_services += value.value + '\n';
            }

            if (['specification_lt_free', 'specification_lt_free_services', 'specification_lt_packet', 'specification_lt_services'].includes(value.code)) {
                lt += `\n${value.value}\n`;
            }

            if (value.code === 'specification_supply') {
                supplyContract += value.value + '\n';
            }

            if (value.code === 'specification_supply_comment') {
                supplyComment += value.value + '\n';
            }

            if (value.code === 'lic_long') {
                licLong = value.value as string;
            }

            if (value.code === 'specification_supply_quantity') {
                loginsQuantity = value.value as string;
            }

            // if (value.code === 'contract_internet_email') {
            //     contractInternetEmail = value.value;
            // }

            if (value.code === 'specification_pk') {
                specification_pk = 'Правовая поддержка: ' + value.value;
            }

            if (value.code === 'specification_pk_comment1') {
                specification_pk_comment1 = value.value as string;
            }

            if (value.code === 'specification_pk_comment') {
                specification_pk_comment = value.value as string;
            }

            if (value.code === 'specification_email_comment') {
                specification_email_comment = value.value as string;
            }

            if (value.code === 'specification_distributive') {
                specification_distributive = value.value as string;
            }

            if (value.code === 'specification_distributive_comment') {
                specification_distributive_comment = value.value as string;
            }

            if (value.code === 'specification_dway') {
                specification_dway = value.value as string;
            }

            if (value.code === 'specification_dway_comment') {
                specification_dway_comment = value.value as string;
            }
        }

        return {
            complect_name,
            infoblocks,
            specification_services,
            legal_techs: lt,
            supply_contract: supplyContract,
            supply_comment_1: supplyComment,
            logins_quantity: loginsQuantity,
            lic_long: licLong,
            contract_internet_email: contractInternetEmail,
            specification_email_comment,
            specification_pk,
            specification_pk_comment1,
            specification_pk_comment,
            specification_distributive,
            specification_distributive_comment,
            specification_dway,
            specification_dway_comment,
        };
    }


}

