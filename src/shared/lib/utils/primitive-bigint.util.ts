export const bigintConvertToNumber = (
    value: bigint | undefined | string | number,
): number => {
    if (value === undefined) {
        return 0;
    }
    if (typeof value === 'bigint') {
        return Number(value.toString());
    }
    if (typeof value === 'string') {
        return Number(value);
    }
    if (typeof value === 'number') {
        return value;
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
