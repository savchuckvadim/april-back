export const bigintConvertToNumber = (value: bigint): number => {
    if (typeof value === 'bigint') {
        return Number(value.toString());
    }
    return value;
};

export const convertToBigint = (
    value: number | string | bigint | undefined,
): bigint => {
    if (value === undefined) {
        return BigInt(0);
    }
    if (typeof value === 'number') {
        return BigInt(value);
    }
    if (typeof value === 'string') {
        return BigInt(value);
    }
    return value;
};
