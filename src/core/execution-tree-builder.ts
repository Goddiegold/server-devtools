import { IDevToolsSpan, IDevToolsTrace, IExecutionNode } from "../types";



export default class ExecutionTreeBuilder {

    build(trace: IDevToolsTrace) {
        const nodes = new Map<string, IExecutionNode>();
        // const rootSpan = trace.spans.find(span => span.spanId === trace.rootSpanId)

        // if (!rootSpan) {
        //     return [];
        // }


        for (const span of trace.spans) {
            nodes.set(span.spanId, {
                span,
                children: [],
            });
        }

        const roots: IExecutionNode[] = [];

        for (const span of trace.spans) {
            const node = nodes.get(span.spanId)!;

            if (!span.parentSpanId) {
                roots.push(node)
                continue;
            }

            const parent = nodes.get(span.parentSpanId!);
            if (!parent) {
                roots.push(node)
                continue;
            }

            parent.children.push(node);
        }

        roots.sort(
            (a, b) => a.span.startedAt - b.span.startedAt
        );

        for (const root of roots) {
            this.sortNode(root);
        }

        return roots;
    }

    private sortNode(node: IExecutionNode): void {
        node.children.sort(
            (a, b) => a.span.startedAt - b.span.startedAt
        );

        for (const child of node.children) {
            this.sortNode(child);
        }
    }
}
