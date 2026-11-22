import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { AppService } from "./app.service";
import { FetchTestService } from "./fetch-test.service";

@Controller()
export class ExternalController {
  constructor(
    private readonly appService: AppService,
    private readonly fetchTestService: FetchTestService,
  ) {}

  @Post("external-test")
  externalTest(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("x-test-response", "hello-from-server");

    return {
      received: body,
      secret: "response-secret",
    };
  }

  @Get("fetch-test")
  fetchTest() {
    return this.fetchTestService.run();
  }

  @Get("nested-database-tracking")
  nestedDatabaseTracking() {
    return this.appService.nestedDatabaseTracking();
  }

  @Get("track-isolation-test")
  trackIsolationTest(@Query("tag") tag?: string) {
    return this.appService.runTrackIsolationTest(tag?.trim() || "default");
  }

  @Post("nested-tracking")
  nestedTracking() {
    return this.appService.processOrder();
  }
}