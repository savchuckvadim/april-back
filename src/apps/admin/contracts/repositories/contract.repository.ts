import { contracts } from 'generated/prisma';

export abstract class ContractRepository {
    abstract create(contract: Partial<contracts>): Promise<contracts | null>;
    abstract findById(id: number): Promise<contracts | null>;
    abstract findMany(): Promise<contracts[] | null>;
    abstract update(id: number, contract: Partial<contracts>): Promise<contracts | null>;
    abstract delete(id: number): Promise<boolean>;
}

