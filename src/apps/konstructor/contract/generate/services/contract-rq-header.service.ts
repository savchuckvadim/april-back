import RussianNounsJS, { createLemma } from 'russian-nouns-js';
import { incline } from 'lvovich';
import { FioT } from "lvovich/lib/gender";
import { ClientTypeEnum } from 'src/apps/konstructor/document-generate/type/client.type';
import { Injectable } from '@nestjs/common';
import { ContractRqService } from './contract-rq.service';
import { RqEntity } from 'src/modules/portal-konstructor/provider';


@Injectable()
export class ContractRqHeaderService {

    private Gender: typeof RussianNounsJS.Gender;
    private Case: typeof RussianNounsJS.Case;
    private rne: RussianNounsJS.Engine;
    constructor(
        private readonly rqService: ContractRqService
    ) {
        this.rne = new RussianNounsJS.Engine();
        this.Gender = RussianNounsJS.Gender;
        this.Case = RussianNounsJS.Case;


    }

    public getContractHeaderText(contractType: string, clientType: ClientTypeEnum, clientRq: any, providerRq: RqEntity): string {
        const roles = this.rqService.getRoles(contractType);
        const providerRole = roles.provider;
        const clientRole = roles.client;

        const providerType = providerRq.type;
        const providerCompanyFullName = providerRq.fullname;
        const providerCompanyDirectorName = providerRq.director;
        const providerCompanyDirectorPosition = providerRq.position;
        const providerCompanyDirectorNameCase = this.inflectName(providerCompanyDirectorName);
        const providerCompanyDirectorPositionCase = this.inflectNoun(providerCompanyDirectorPosition);
        const providerCompanyBased = providerRq.based;

        let clientCompanyFullName = ' __________________________________________________________ ';
        let clientCompanyDirectorNameCase = '____________________________________________________';
        let clientCompanyDirectorPositionCase = '______________________________________________';
        let clientCompanyBased = 'Устава';

        if (clientRq?.fields) {
            for (const rqItem of clientRq.fields) {
                if (rqItem.value) {
                    if (rqItem.code === 'fullname' && (clientType === 'ip' || clientType === 'org' || clientType === 'org_state')) {
                        clientCompanyFullName = rqItem.value;
                    } else if (rqItem.code === 'personName' && clientType === 'fiz') {
                        clientCompanyFullName = rqItem.value;
                    } else if (rqItem.code === 'position_case') {
                        clientCompanyDirectorPositionCase = rqItem.value;
                    } else if (rqItem.code === 'director_case') {
                        clientCompanyDirectorNameCase = rqItem.value;
                    } else if (rqItem.code === 'based') {
                        clientCompanyBased = rqItem.value;
                    }
                }
            }
        }

        let headerText = `${providerCompanyFullName} , официальный партнер компании "Гарант", именуемый в дальнейшем "${providerRole}`;

        if (providerType === 'org' || providerType === 'org_state') {
            headerText += `, в лице ${providerCompanyDirectorPositionCase} ${providerCompanyDirectorNameCase}, действующего(-ей) на основании ${providerCompanyBased}`;
        }

        headerText += ` с одной стороны и ${clientCompanyFullName}, именуемое(-ый) в дальнейшем "${clientRole}`;

        if (clientType === 'org' || clientType === 'org_state') {
            headerText += `, в лице ${clientCompanyDirectorPositionCase} ${clientCompanyDirectorNameCase}, действующего(-ей) на основании ${clientCompanyBased}`;
        }

        if (clientType === 'ip') {
            headerText += `, действующего(-ей) на основании ${clientCompanyBased}`;
        }

        headerText += ' с другой стороны, заключили настоящий Договор о нижеследующем:';

        return headerText;
    }


    private inflectName(fio: string,): string {
        const fioParts = this.splitFullName(fio);
        // const gender = getGender(fioParts);
        const inflectedName = incline(fioParts, 'genitive');

        return ` ${inflectedName.last} ${inflectedName.first} ${inflectedName.middle}`;
    }
    private inflectNoun(noun: string,): string {
        const lemma = createLemma({ text: noun, gender: this.Gender.MASCULINE });
        const result = this.rne.decline(lemma, this.Case.GENITIVE);
        return result[0];
    }
    private splitFullName(fullName: string): FioT {
        const parts = fullName.trim().split(/\s+/);
        return {
            last: parts[0] || null,
            first: parts[1] || null,
            middle: parts[2] || null,
        };
    }
    // private getNounCase(noun: string, case_: string): string {
    //     // TODO: Implement noun case logic
    //     return noun;
    // }

}

