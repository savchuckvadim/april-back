import { Injectable } from '@nestjs/common';
import { DocumentClientBxRqService } from 'src/apps/konstructor/document-generate/bx-client-rq/bx-client-rq.service';
import { BxRqDto } from 'src/apps/konstructor/document-generate/dto/bx-rq/bx-rq.dto';
import { ClientTypeEnum } from 'src/apps/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from 'src/apps/konstructor/document-generate/type/contract.type';
import { RqEntity } from 'src/modules/portal-konstructor/provider';
@Injectable()
export class ContractRqService {
    constructor(
        private readonly clientRqService: DocumentClientBxRqService,

    ) {

    }

    public getRqs(
        provider: RqEntity,
        clientRq: BxRqDto,
        clientType: ClientTypeEnum,
        contractType: CONTRACT_LTYPE,

    ): {
        we_role: string;
        we_rq: string[];
        we_role_case: string;
        we_direct_position: string;
        we_direct_fio: string;
        client_role: string;
        client_rq: string[];
        client_role_case: string;
        client_direct_position: string;
        client_direct_fio: string;
    } {


        const providerRq = this.getProviderData(provider);
        const clientRqData = this.clientRqService.getClientRq(clientRq, clientType);
        const roles = this.getRoles(contractType);
        return {
            we_rq: [
                providerRq.companyName,
                providerRq.inn,
                providerRq.address,
                providerRq.phone,
                providerRq.email,
                providerRq.bank,
                providerRq.bik,
                providerRq.rs,
                providerRq.ks,
                providerRq.providerCompanyDirectorPosition,
                providerRq.providerCompanyDirectorName
            ],
            client_rq: clientRqData,
            we_role: roles.provider,
            we_role_case: roles.providerCase,
            we_direct_position: providerRq.providerCompanyDirectorPosition,

            we_direct_fio: providerRq.providerCompanyDirectorName,

            client_role: roles.client,

            client_role_case: roles.clientCase,
            client_direct_position: clientRq.fields.find(field => field.code === 'position')?.value as string || '',
            client_direct_fio: clientRq.fields.find(field => field.code === 'director')?.value as string || '',
        }


    }


    private getProviderData(provider: RqEntity) {
        const rq = provider;
        return {
            companyName: rq.fullname,
            address: rq.registredAdress,
            phone: `тел: ${rq.phone}`,
            email: `email: ${rq.email}`,
            inn: `ИНН: ${rq.inn}`,
            rs: `р/с: ${rq.rs}`,
            ks: `к/с: ${rq.ks}`,
            bank: rq.bank,
            bik: `БИК: ${rq.bik}`,
            providerBankAddress: rq.bankAdress,
            providerCompanyDirectorPosition: rq.position,
            providerCompanyDirectorName: rq.director,
        };
    }

    public getRoles(contractType: string): { provider: string; client: string; providerCase: string; clientCase: string } {
        let clientRole = 'Заказчик';
        let providerRole = 'Исполнитель';

        switch (contractType) {
            case 'abon':
            case 'key':
                clientRole = 'Покупатель';
                providerRole = 'Поставщик';
                break;
            case 'lic':
                clientRole = 'Лицензиат';
                providerRole = 'Лицензиар';
                break;
            default:
                clientRole = 'Заказчик';
                providerRole = 'Исполнитель';
                break;
        }

        const providerCase = 'от Исполнителя'
        const clientCase = 'от Заказчика'
        return {
            provider: providerRole,
            client: clientRole,
            providerCase,
            clientCase,
        };
    }

}
