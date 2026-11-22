import { Injectable } from "@nestjs/common";
import { Track } from "server-devtools";

@Injectable()
export class FetchTestService {
  @Track("bad-fetch-test")
  async run() {
    const response = await fetch("http://localhost:3000/external-test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-header": "fetch-test",
      },
      body: JSON.stringify({
        name: "Godwin",
        source: "fetch",
      }),
    });

    return response.json();
  }
}