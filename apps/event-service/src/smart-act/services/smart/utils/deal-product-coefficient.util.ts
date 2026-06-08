/** Согласовано с OrkActsUpdateUseCase.getProductCoefficient (длинное число в строке раньше). */
export function coefficientFromDealMeasureName(
    measureName: string | undefined,
): number {
    if (!measureName) {
        return 1;
    }
    if (measureName.includes('24')) {
        return 24;
    }
    if (measureName.includes('12')) {
        return 12;
    }
    if (measureName.includes('6')) {
        return 6;
    }
    if (measureName.includes('3')) {
        return 3;
    }
    return 1;
}
