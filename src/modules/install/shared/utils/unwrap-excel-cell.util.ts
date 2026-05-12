export function unwrapExcelCellValue(value: unknown): unknown {
    if (value !== null && typeof value === 'object' && 'result' in value) {
        return (value as { result: unknown }).result;
    }
    return value;
}
