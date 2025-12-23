// Типы для данных из JSON файла (gsr.last-migrate.json)
export interface SheetDataProduct {
    id?: number;
    name: string;
    quantity: number;
    monthSum: string;
    armId: string;
    contractEndDate?: string;
    contractType?: string;
    contractPrepayment?: number;
}

export interface SheetDataContact {
    name: string;
    position: string;
    phone: string;
    email: string;
    payinfo: string;
}

export interface SheetDataCompany {
    clientName: string;
    address: string;
    complectName: string;
    price: string;
    email: string;
    complectBlocks: string;
    managerName: string;
    armId: string;
    contacts: SheetDataContact[];
    products: SheetDataProduct[];
}

export interface SheetData {
    sheetId: number;
    companyName: string;
    sheetData: string;
    contacts: SheetDataContact[];
    company: SheetDataCompany;
}

