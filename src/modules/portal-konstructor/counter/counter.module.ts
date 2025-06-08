import { Module } from "@nestjs/common";
import { CounterPrismaRepository } from "./counter.prisma.repository";
import { CounterRepository } from "./counter.repository";

@Module({
    providers: [
        {
            provide: CounterRepository,
            useClass: CounterPrismaRepository,
        },
    ],
    exports: [CounterRepository],
})
export class CounterModule { } 