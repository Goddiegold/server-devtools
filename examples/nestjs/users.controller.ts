
import { Controller, Get, Param } from '@nestjs/common';
import { users } from './mongo';


@Controller('users')
export class UsersController {
  @Get('broken')
  broken() {
    throw new Error('Something went wrong');
  }

  @Get('/:id')
  async getUser(@Param('id') id: string) {
    const user = await users.findOne({
      externalId: id,
    });
    await fetch('https://example.com');

    return {
      id,
    };
  }


}