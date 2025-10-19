import { Module } from '@nestjs/common';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';
import { UserRepository } from './repositories/user.repository';
import { UserPrismaRepository } from './repositories/user.prisma.repository';

@Module({
    controllers: [UserController],
    providers: [
        UserService,
        {
            provide: UserRepository,
            useClass: UserPrismaRepository,
        },
    ],
    exports: [
        UserService,
        UserRepository,
    ],
})
export class UserModule { }
