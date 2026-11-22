import { Controller, Get, Param } from "@nestjs/common";

import { AppService } from "./app.service";
import { users } from "./mongo";

@Controller("users")
export class UsersController {
  constructor(private readonly appService: AppService) {}

  @Get("track-payment")
  trackPayment() {
    return this.appService.checkout();
  }

  @Get("track-payment-service")
  trackPaymentViaService() {
    return this.appService.trackedCheckout();
  }

  @Get("hello")
  hello() {
    return {
      message: "Hello from NestJS",
    };
  }

  @Get("broken")
  broken() {
    throw new Error("Something went wrong");
  }

  @Get("mongo/:id")
  async mongo(@Param("id") id: string) {
    const user = await users.findOne({
      externalId: id,
    });

    return {
      id,
      user,
    };
  }

  @Get("fetch")
  async fetchExternal() {
    const response = await fetch("https://example.com");
    const body = await response.text();

    return {
      status: response.status,
      bodyLength: body.length,
    };
  }

  @Get("combined/:id")
  async combined(@Param("id") id: string) {
    const user = await users.findOne({
      externalId: id,
    });

    const response = await fetch("https://example.com");

    return {
      id,
      userFound: Boolean(user),
      externalStatus: response.status,
    };
  }
}