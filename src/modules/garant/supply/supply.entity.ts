export class SupplyEntity {
    id: bigint;
    name: string;
    fullName: string;
    shortName: string;
    saleName_1: string | null;
    saleName_2: string | null;
    saleName_3: string | null;
    usersQuantity: number;
    description: string | null;
    code: string;
    type: string;
    color: string | null;
    coefficient: number;
    contractName: string | null;
    contractPropComment: string | null;
    contractPropEmail: string | null;
    contractPropLoginsQuantity: string | null;
    lcontractName: string | null;
    lcontractPropComment: string | null;
    lcontractPropEmail: string | null;
    created_at: Date | null;
    updated_at: Date | null;
} 