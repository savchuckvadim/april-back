import { RqEntity } from '@/modules/portal-konstructor/provider';
import { Injectable } from '@nestjs/common';

export interface IProviderRqRenderData {
    MyCompanyName: string;
    MyCompanyFullName: string;
    MyCompanyINN: string;
    MyCompanyKPP: string;
    MyCompanyAddress: string;
    MyCompanyPrimaryAddress: string;
    MyCompanyPhone: string;
    MyCompanyEmail: string;
    MyCompanyBank: string;
    MyCompanyBankAddress: string;
    MyCompanyBik: string;
    MyCompanyRs: string;
    MyCompanyKs: string;
    MyCompanyOgrn: string;
    MyCompanyInvoiceRq: string;
}
@Injectable()
export class OfferRenderProviderRqService {
    constructor() {}

    public renderProviderRq(provider: RqEntity | null): IProviderRqRenderData {
        const myCompanyInfoiceRq = this.getInvoiceRq(provider);
        return {
            MyCompanyName: this.getValue(provider?.shortname),
            MyCompanyFullName: this.getValue(provider?.fullname),
            MyCompanyINN: this.getValue(provider?.inn),
            MyCompanyKPP: this.getValue(provider?.kpp),
            MyCompanyAddress: this.getValue(provider?.registredAdress),
            MyCompanyPrimaryAddress: this.getValue(provider?.primaryAdresss),
            MyCompanyPhone: this.getValue(provider?.phone),
            MyCompanyEmail: this.getValue(provider?.email),
            MyCompanyBank: this.getValue(provider?.bank),
            MyCompanyBankAddress: this.getValue(provider?.bankAdress),
            MyCompanyBik: this.getValue(provider?.bik),
            MyCompanyRs: this.getValue(provider?.rs),
            MyCompanyKs: this.getValue(provider?.ks),
            MyCompanyOgrn: this.getValue(provider?.ogrn),
            MyCompanyInvoiceRq: myCompanyInfoiceRq,
        };
    }
    protected getValue(value: string | undefined | null): string {
        return value && value !== 'null' ? value : '';
    }
    protected getInvoiceRq(provider: RqEntity | null): string {
        const myCompanyName = this.getValue(provider?.name);

        const myCompanyINN = this.getValue(provider?.inn);
        const myCompanyKPP = this.getValue(provider?.kpp);
        const myCompanyAddress = this.getValue(provider?.registredAdress);
        const space = '________________________________________';
        let myCompanyInfoiceRq = '________________________________________';
        if (myCompanyName) {
            myCompanyInfoiceRq = `${myCompanyName}`;
        }

        if (myCompanyINN) {
            const inn = `ИНН: ${myCompanyINN}`;
            myCompanyInfoiceRq += myCompanyInfoiceRq ? `, ${inn}` : `${inn}`;
        }
        if (myCompanyKPP) {
            const kpp = `КПП: ${myCompanyKPP}`;
            myCompanyInfoiceRq += myCompanyInfoiceRq ? `, ${kpp}` : `${kpp}`;
        }
        if (myCompanyAddress) {
            myCompanyInfoiceRq += myCompanyInfoiceRq
                ? `, ${myCompanyAddress}`
                : `${myCompanyAddress}`;
        }
        return myCompanyInfoiceRq || space;
    }
}
