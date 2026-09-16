import { Controller, Get, Param } from '@nestjs/common';
import { users } from './mongo';

@Controller('users')
export class UsersController {
  // 1. Basic NestJS request
  @Get('hello')
  hello() {
    return {
      message: 'Hello from NestJS',
    };
  }

  // 2. Error capture
  @Get('broken')
  broken() {
    throw new Error('Something went wrong');
  }

  // 3. MongoDB capture
  @Get('mongo/:id')
  async mongo(@Param('id') id: string) {
    const user = await users.findOne({
      externalId: id,
    });

    return {
      id,
      user,
    };
  }

  // 4. Outbound fetch capture
  @Get('fetch')
  async fetchExternal() {
    const response = await fetch('https://example.com');
    const body = await response.text();

    return {
      status: response.status,
      bodyLength: body.length,
    };
  }

  // 5. Mongo + outbound HTTP in one request
  @Get('combined/:id')
  async combined(@Param('id') id: string) {
    const user = await users.findOne({
      externalId: id,
    });

    const response = await fetch('https://example.com');

    return {
      id,
      userFound: Boolean(user),
      externalStatus: response.status,
    };
  }
}