import { Injectable } from "@nestjs/common";
import { Track } from "server-devtools";

import { users } from "./mongo";

@Injectable()
export class AppService {
  async processPayment() {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  async updateWallet() {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  @Track("payment-processing")
  async checkout() {
    await this.processPayment();
    await this.updateWallet();
    return { success: true, via: "service-track" };
  }

  @Track("payment-processing-service")
  async trackedCheckout() {
    await this.processPayment();
    await this.updateWallet();
    return { success: true, via: "service-track" };
  }

  @Track("process-order")
  async processOrder() {
    const payment = await this.chargeViaPaymentProvider();
    const inventory = await this.updateInventory();

    return {
      status: "completed",
      payment,
      inventory,
    };
  }

  @Track("process-payment")
  async chargeViaPaymentProvider() {
    const response = await fetch("http://localhost:3000/external-test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-header": "nested-tracking",
      },
      body: JSON.stringify({
        provider: "example",
        action: "charge",
      }),
    });

    return {
      providerStatus: response.status,
      ...(await response.json()),
    };
  }

  @Track("update-inventory")
  async updateInventory() {
    const item = await users.findOne({ externalId: "nested-tracking-demo" });

    return {
      sku: "nested-tracking-demo",
      found: Boolean(item),
    };
  }

  @Track("process-order")
  async nestedDatabaseTracking() {
    const user = await users.findOne({ externalId: "nested-database-demo" });

    return {
      collection: "users",
      lookup: "nested-database-demo",
      found: Boolean(user),
      user,
    };
  }

  async runTrackIsolationTest(requestTag = "default") {
    const settled = await Promise.allSettled([
      this.isolationAlpha(requestTag),
      this.isolationBeta(requestTag),
      this.isolationGamma(requestTag),
    ]);

    const spanNames = ["isolation-alpha", "isolation-beta", "isolation-gamma"] as const;
    const operations = settled.map((result, index) => {
      const spanName = spanNames[index];

      if (result.status === "fulfilled") {
        return { spanName, status: "fulfilled" as const, result: result.value };
      }

      const reason = result.reason;
      const message = reason instanceof Error ? reason.message : String(reason);

      return {
        spanName,
        status: "rejected" as const,
        error: message,
      };
    });

    const succeeded = operations.filter((op) => op.status === "fulfilled").length;
    const failed = operations.length - succeeded;

    return {
      route: "track-isolation-test",
      requestTag,
      concurrentOperations: operations.length,
      summary: { succeeded, failed },
      operations,
    };
  }

  @Track("isolation-alpha")
  async isolationAlpha(requestTag: string) {
    const user = await users.findOne({ externalId: `isolation-${requestTag}` });

    return {
      track: "isolation-alpha",
      requestTag,
      database: { found: Boolean(user) },
    };
  }

  @Track("isolation-beta")
  async isolationBeta(requestTag: string) {
    const response = await fetch("http://localhost:3000/external-test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-header": "track-isolation-test",
      },
      body: JSON.stringify({
        requestTag,
        operation: "isolation-beta",
      }),
    });

    const body = await response.json();

    return {
      track: "isolation-beta",
      requestTag,
      http: { status: response.status, body },
    };
  }

  @Track("isolation-gamma")
  async isolationGamma(_requestTag: string) {
    await Promise.resolve();
    throw new Error("isolation-failure");
  }
}