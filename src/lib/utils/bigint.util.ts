/**
 * Утилита для сериализации BigInt значений в JSON
 */
export class BigIntUtil {
    /**
     * Replacer функция для JSON.stringify для обработки BigInt
     */
    static replacer(key: string, value: any): any {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    }

    /**
     * Рекурсивная функция для сериализации объекта с BigInt значениями
     */
    static serializeBigInt(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj === 'bigint') {
            return obj.toString();
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.serializeBigInt(item));
        }

        if (typeof obj === 'object') {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.serializeBigInt(value);
            }
            return result;
        }

        return obj;
    }
} 