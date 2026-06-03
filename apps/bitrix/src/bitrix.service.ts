import { Injectable } from '@nestjs/common';

@Injectable()
export class BitrixService {
    getHello(): string {
        return 'Hello World!';
    }
}
