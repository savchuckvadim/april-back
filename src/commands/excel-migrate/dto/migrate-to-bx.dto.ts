
export type Product = {
    name: string,
    quantity: number,
    monthSum: string,
    armId: string,
}

export type Contact = {
    name: string, 
    position: string, 
    communicationsRate: 
    string, phone: string, 
    email: string,
    contactFirstEdu: string,
    contactFirstEduComment: string,
    contactEdu: string,
    contactEduComment: string,
    contactExamination: string,
    contactQualification: string,
    contactSkap: string,
    conmtactGl: string,
    contactGarantClub: string,


}
export type Contract = {
    contractEndDate: string,
    contractType: string,
    contractPrepayment: string
}
export class MigrateToBxDto {
    id: string;
    company: string;
    // kit: '' as string,
    products: Product[];
    contacts: Contact[];
    contract: Contract;
    document: string;
    payinfo: string;
    complectInfo: string;
    concurent: string;
    supplyDate: string;
}

