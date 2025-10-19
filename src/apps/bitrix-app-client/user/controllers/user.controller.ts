import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
    UseGuards,
    Request
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { EResultCode, SuccessResponseDto } from '@/core';

@ApiTags('User Management')
@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) { }

    @ApiOperation({ summary: 'Create a new user' })
    @ApiResponse({
        status: 201,
        description: 'User created successfully',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 409,
        description: 'User with this email already exists',
    })
    @Post()
    async createUser(@Body() createUserDto: CreateUserDto): Promise<SuccessResponseDto> {
        const user = await this.userService.createUser(createUserDto);
        return {
            resultCode: 0, // EResultCode.SUCCESS
            data: user,
        };
    }

    @ApiOperation({ summary: 'Get user by ID' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @Get(':id')
    async getUserById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const user = await this.userService.findUserById(id);
        return {
            resultCode: 0,
            data: user,
        };
    }

    @ApiOperation({ summary: 'Get user by email' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @Get('email/:email')
    async getUserByEmail(@Param('email') email: string): Promise<SuccessResponseDto> {
        const user = await this.userService.findUserByEmail(email);
        return {
            resultCode: 0,
            data: user,
        };
    }

    @ApiOperation({ summary: 'Get users by client ID' })
    @ApiResponse({
        status: 200,
        description: 'Users found',
        type: [UserResponseDto],
    })
    @Get('client/:clientId')
    async getUsersByClientId(@Param('clientId', ParseIntPipe) clientId: number): Promise<SuccessResponseDto> {
        const users = await this.userService.findUsersByClientId(clientId);
        return {
            resultCode: 0,
            data: users,
        };
    }

    @ApiOperation({ summary: 'Get user by Bitrix ID' })
    @ApiResponse({
        status: 200,
        description: 'User found',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @Get('bitrix/:bitrixId')
    async getUserByBitrixId(@Param('bitrixId') bitrixId: string): Promise<SuccessResponseDto> {
        const user = await this.userService.findUserByBitrixId(bitrixId);
        return {
            resultCode: 0,
            data: user,
        };
    }

    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({
        status: 200,
        description: 'Users found',
        type: [UserResponseDto],
    })
    @Get()
    async getAllUsers(): Promise<SuccessResponseDto> {
        const users = await this.userService.findAllUsers();
        return {
            resultCode: 0,
            data: users,
        };
    }

    @ApiOperation({ summary: 'Update user' })
    @ApiResponse({
        status: 200,
        description: 'User updated successfully',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @ApiResponse({
        status: 409,
        description: 'User with this email already exists',
    })
    @Put(':id')
    async updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateUserDto: UpdateUserDto
    ): Promise<SuccessResponseDto> {
        const user = await this.userService.updateUser(id, updateUserDto);
        return {
            resultCode: 0,
            data: user,
        };
    }

    @ApiOperation({ summary: 'Delete user' })
    @ApiResponse({
        status: 200,
        description: 'User deleted successfully',
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    @Delete(':id')
    async deleteUser(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.userService.deleteUser(id);
        return {
            resultCode: 0,
            data: null,
        };
    }

    @ApiOperation({ summary: 'Get owner by client ID' })
    @ApiResponse({
        status: 200,
        description: 'Owner found',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Owner not found',
    })
    @Get('client/:clientId/owner')
    async getOwnerByClientId(@Param('clientId', ParseIntPipe) clientId: number): Promise<SuccessResponseDto> {
        const owner = await this.userService.findOwnerByClientId(clientId);
        return {
            resultCode: 0,
            data: owner,
        };
    }

    @ApiOperation({ summary: 'Get users by role ID' })
    @ApiResponse({
        status: 200,
        description: 'Users found',
        type: [UserResponseDto],
    })
    @Get('role/:roleId')
    async getUsersByRoleId(@Param('roleId', ParseIntPipe) roleId: number): Promise<SuccessResponseDto> {
        const users = await this.userService.findUsersByRoleId(roleId);
        return {
            resultCode: 0,
            data: users,
        };
    }

    @ApiOperation({ summary: 'Get active users by client ID' })
    @ApiResponse({
        status: 200,
        description: 'Active users found',
        type: [UserResponseDto],
    })
    @Get('client/:clientId/active')
    async getActiveUsersByClientId(@Param('clientId', ParseIntPipe) clientId: number): Promise<SuccessResponseDto> {
        const users = await this.userService.findActiveUsersByClientId(clientId);
        return {
            resultCode: 0,
            data: users,
        };
    }

    @ApiOperation({ summary: 'Validate user credentials' })
    @ApiResponse({
        status: 200,
        description: 'Credentials validated',
        type: UserResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: 'Invalid credentials',
    })
    @Post('validate-credentials')
    async validateCredentials(
        @Body() credentials: { email: string; password: string }
    ): Promise<SuccessResponseDto> {
        const user = await this.userService.validateUserCredentials(credentials.email, credentials.password);
        if (!user) {
            return {
                resultCode: EResultCode.ERROR, // EResultCode.ERROR
                data: null,
            };
        }
        return {
            resultCode: EResultCode.SUCCESS,
            data: user,
        };
    }
}
