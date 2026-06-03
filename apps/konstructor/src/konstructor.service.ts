import { Injectable } from '@nestjs/common';

@Injectable()
export class KonstructorService {
    getHello(): string {
        return 'Hello World!';
    }
}
