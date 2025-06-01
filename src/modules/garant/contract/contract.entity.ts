export class ContractEntity {
    id: bigint;
    name: string;
    number: number;
    title: string;
    code: string;
    type: string;
    template: string | null;
    order: number | null;
    coefficient: number;
    prepayment: number;
    discount: number;
    productName: string | null;
    product: string | null;
    service: string | null;
    description: string | null;
    comment: string | null;
    comment1: string | null;
    comment2: string | null;
    withPrepayment: boolean;
    created_at: Date | null;
    updated_at: Date | null;
} 