import { Transform } from 'class-transformer';

export function ToNumber() {
    return Transform(({ value }) => {
        if (value === null || value === undefined || value === '') {
            return value;
        }

        const num = Number(value);
        return Number.isNaN(num) ? value : num;
    });
}
