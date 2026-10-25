export class Bank {
    ID?: number | null;
    NAME?: string | null;
    ENTITY_ID?: number | null;
    RQ_BANK_NAME?: string | null;
    RQ_BANK_ADDR?: string | null;
    RQ_BANK_CODE?: string | null;
    RQ_BIK?: string | number | null;
    RQ_ACC_NUM?: string | number | null;
    RQ_COR_ACC_NUM?: string | number | null;
    COMMENTS?: string | null;

    constructor(data: Partial<Bank>) {
        this.ID = data.ID ?? null;
        this.NAME = data.NAME ?? null;
        this.ENTITY_ID = data.ENTITY_ID ?? null;
        this.RQ_BANK_NAME = data.RQ_BANK_NAME ?? null;
        this.RQ_BANK_ADDR = data.RQ_BANK_ADDR ?? null;
        this.RQ_BANK_CODE = data.RQ_BANK_CODE ?? null;
        this.RQ_BIK = data.RQ_BIK ?? null;
        this.RQ_ACC_NUM = data.RQ_ACC_NUM ?? null;
        this.RQ_COR_ACC_NUM = data.RQ_COR_ACC_NUM ?? null;
        this.COMMENTS = data.COMMENTS ?? '';
    }
}
