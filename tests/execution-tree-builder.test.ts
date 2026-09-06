import assert from "node:assert/strict"

import ExecutionTreeBuilder from "../src/core/execution-tree-builder"
import type { IDevToolsTrace } from "../src/types"

const rootSpan = {
    traceId: "trace-1",
    spanId: "root-1",
    type: "http.server" as const,
    name: "GET /users/:id",
    startedAt: 1000,
    durationMs: 100,
    attributes: {},
    status: {
        code: 0,
    },
}

const trace: IDevToolsTrace = {
    traceId: "trace-1",
    rootSpanId: "root-1",
    startedAt: 1000,
    durationMs: 100,
    spans: [rootSpan],
}

const builder = new ExecutionTreeBuilder()

const result = builder.build(trace)

assert.equal(result.length, 1)

assert.equal(
    result[0].span.spanId,
    "root-1"
)

assert.deepEqual(
    result[0].children,
    []
)

const childSpan = {
    traceId: "trace-2",
    spanId: "db-1",
    parentSpanId: "root-2",
    type: "database" as const,
    name: "find users",
    startedAt: 1010,
    durationMs: 20,
    attributes: {},
    status: {
        code: 0,
    },
};

const traceWithChild: IDevToolsTrace = {
    traceId: "trace-2",
    rootSpanId: "root-2",
    startedAt: 1000,
    durationMs: 100,
    spans: [
        {
            traceId: "trace-2",
            spanId: "root-2",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 100,
            attributes: {},
            status: {
                code: 0,
            },
        },
        childSpan,
    ],
};

const resultWithChild = builder.build(traceWithChild);

assert.equal(resultWithChild.length, 1);

assert.equal(
    resultWithChild[0].span.spanId,
    "root-2"
);

assert.equal(
    resultWithChild[0].children.length,
    1
);

assert.equal(
    resultWithChild[0].children[0].span.spanId,
    "db-1"
);

const nestedTrace: IDevToolsTrace = {
    traceId: "trace-3",
    rootSpanId: "root-3",
    startedAt: 1000,
    durationMs: 200,
    spans: [
        {
            traceId: "trace-3",
            spanId: "root-3",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 200,
            attributes: {},
            status: {
                code: 0,
            },
        },
        {
            traceId: "trace-3",
            spanId: "service-1",
            parentSpanId: "root-3",
            type: "framework",
            name: "users handler",
            startedAt: 1010,
            durationMs: 150,
            attributes: {},
            status: {
                code: 0,
            },
        },
        {
            traceId: "trace-3",
            spanId: "db-2",
            parentSpanId: "service-1",
            type: "database",
            name: "find users",
            startedAt: 1020,
            durationMs: 30,
            attributes: {},
            status: {
                code: 0,
            },
        },
    ],
};

const nestedResult = builder.build(nestedTrace);

assert.equal(nestedResult.length, 1);

assert.equal(
    nestedResult[0].children.length,
    1
);

assert.equal(
    nestedResult[0].children[0].span.spanId,
    "service-1"
);

assert.equal(
    nestedResult[0].children[0].children.length,
    1
);

assert.equal(
    nestedResult[0].children[0].children[0].span.spanId,
    "db-2"
);


const unorderedTrace: IDevToolsTrace = {
    traceId: "trace-4",
    rootSpanId: "root-4",
    startedAt: 1000,
    durationMs: 200,
    spans: [
        {
            traceId: "trace-4",
            spanId: "root-4",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 200,
            attributes: {},
            status: { code: 0 },
        },

        // Deliberately placed later in execution first
        {
            traceId: "trace-4",
            spanId: "http-1",
            parentSpanId: "root-4",
            type: "http.client",
            name: "GET external-api",
            startedAt: 1100,
            durationMs: 50,
            attributes: {},
            status: { code: 0 },
        },

        // Started before http-1, but appears after it in spans[]
        {
            traceId: "trace-4",
            spanId: "db-1",
            parentSpanId: "root-4",
            type: "database",
            name: "find users",
            startedAt: 1020,
            durationMs: 20,
            attributes: {},
            status: { code: 0 },
        },
    ],
};

const unorderedResult = builder.build(unorderedTrace);

assert.equal(
    unorderedResult[0].children.length,
    2
);

assert.equal(
    unorderedResult[0].children[0].span.spanId,
    "db-1"
);

assert.equal(
    unorderedResult[0].children[1].span.spanId,
    "http-1"
);

const outOfOrderTrace: IDevToolsTrace = {
    traceId: "trace-5",
    rootSpanId: "root-5",
    startedAt: 1000,
    durationMs: 200,
    spans: [
        // Grandchild appears first
        {
            traceId: "trace-5",
            spanId: "db-5",
            parentSpanId: "service-5",
            type: "database",
            name: "find users",
            startedAt: 1020,
            durationMs: 20,
            attributes: {},
            status: { code: 0 },
        },

        // Child appears second
        {
            traceId: "trace-5",
            spanId: "service-5",
            parentSpanId: "root-5",
            type: "framework",
            name: "users handler",
            startedAt: 1010,
            durationMs: 100,
            attributes: {},
            status: { code: 0 },
        },

        // Root appears last
        {
            traceId: "trace-5",
            spanId: "root-5",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 200,
            attributes: {},
            status: { code: 0 },
        },
    ],
};

const outOfOrderResult = builder.build(outOfOrderTrace);

assert.equal(outOfOrderResult.length, 1);

const root = outOfOrderResult[0];

assert.equal(root.span.spanId, "root-5");
assert.equal(root.children.length, 1);

const service = root.children[0];

assert.equal(service.span.spanId, "service-5");
assert.equal(service.children.length, 1);

const database = service.children[0];

assert.equal(database.span.spanId, "db-5");
assert.equal(database.children.length, 0);

const orphanTrace: IDevToolsTrace = {
    traceId: "trace-6",
    rootSpanId: "root-6",
    startedAt: 1000,
    durationMs: 200,
    spans: [
        {
            traceId: "trace-6",
            spanId: "root-6",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 200,
            attributes: {},
            status: { code: 0 },
        },
        {
            traceId: "trace-6",
            spanId: "db-6",
            parentSpanId: "missing-parent",
            type: "database",
            name: "find users",
            startedAt: 1050,
            durationMs: 20,
            attributes: {},
            status: { code: 0 },
        },
    ],
};

const orphanResult = builder.build(orphanTrace);

assert.equal(orphanResult.length, 2);

assert.equal(
    orphanResult[0].span.spanId,
    "root-6"
);

assert.equal(
    orphanResult[1].span.spanId,
    "db-6"
);

const orphanSubtreeTrace: IDevToolsTrace = {
    traceId: "trace-7",
    rootSpanId: "root-7",
    startedAt: 1000,
    durationMs: 200,
    spans: [
        {
            traceId: "trace-7",
            spanId: "root-7",
            type: "http.server",
            name: "GET /users",
            startedAt: 1000,
            durationMs: 200,
            attributes: {},
            status: { code: 0 },
        },
        {
            traceId: "trace-7",
            spanId: "orphan-7",
            parentSpanId: "missing-parent",
            type: "framework",
            name: "orphan handler",
            startedAt: 1020,
            durationMs: 100,
            attributes: {},
            status: { code: 0 },
        },
        {
            traceId: "trace-7",
            spanId: "db-7",
            parentSpanId: "orphan-7",
            type: "database",
            name: "find users",
            startedAt: 1030,
            durationMs: 20,
            attributes: {},
            status: { code: 0 },
        },
    ],
};

const orphanSubtreeResult = builder.build(orphanSubtreeTrace);

assert.equal(orphanSubtreeResult.length, 2);

const orphanRoot = orphanSubtreeResult.find(
    node => node.span.spanId === "orphan-7"
);

assert.ok(orphanRoot);

assert.equal(orphanRoot.children.length, 1);
assert.equal(orphanRoot.children[0].span.spanId, "db-7");

const emptyTrace: IDevToolsTrace = {
    traceId: "trace-empty",
    startedAt: 1000,
    spans: [],
};

const emptyResult = builder.build(emptyTrace);

assert.deepEqual(emptyResult, []);

console.log("execution-tree-builder tests passed")