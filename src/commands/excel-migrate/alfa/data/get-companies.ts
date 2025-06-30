import * as fs from 'fs';
import path from 'path';

export interface ICompany {
    TITLE: string
    ID: string
    UF_CRM_1632896396: string | null
    UF_CRM_1539345538: string
}

const cleanCompanyData = (company: ICompany): ICompany => {
    return {
        ...company,
        TITLE: company.TITLE?.trim() || '',
        UF_CRM_1539345538: company.UF_CRM_1539345538?.replace(/\s+/g, ' ').trim() || '',
        UF_CRM_1632896396: company.UF_CRM_1632896396
    };
};

export const getCompanies = (): ICompany[] => {
    const json = fs.readFileSync(path.resolve(__dirname, '../../../../../src/commands/excel-migrate/alfa/data/companies.json'), 'utf8')
    const companies = JSON.parse(json) as ICompany[]
    return companies.map(cleanCompanyData)
}

export const getDoubles = (): ICompany[][] => {
    const json = fs.readFileSync(path.resolve(__dirname, '../../../../../src/commands/excel-migrate/alfa/data/doubles.json'), 'utf8')
    const doubles = JSON.parse(json) as ICompany[][]
    return doubles.map(group => group.map(cleanCompanyData))
}

