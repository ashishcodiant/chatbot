"use client";

import {
  CheckCircle2Icon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getToolDisplayName, getToolParts } from "@/lib/execution";
import type { ChatMessage } from "@/lib/types";
import { useDataStream } from "./data-stream-provider";

function describeToolState(type: string, state: string) {
  const tool = getToolDisplayName(type);

  switch (state) {
    case "input-streaming":
    case "input-available":
      return {
        action: `Calling ${tool}...`,
        status: "running" as const,
        tool,
      };
    case "approval-requested":
      return {
        action: `Waiting for approval to run ${tool}`,
        status: "running" as const,
        tool,
      };
    case "approval-responded":
      return {
        action: `Approval received for ${tool}`,
        status: "completed" as const,
        tool,
      };
    case "output-available":
      return {
        action: `${tool} completed`,
        status: "completed" as const,
        tool,
      };
    case "output-denied":
      return {
        action: `${tool} was denied`,
        status: "error" as const,
        tool,
      };
    case "output-error":
      return {
        action: `${tool} failed`,
        status: "error" as const,
        tool,
      };
    default:
      return {
        action: `Using ${tool}`,
        status: "running" as const,
        tool,
      };
  }
}

function StatusIcon({ status }: { status: "running" | "completed" | "error" }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-4 text-green-600" />;
  }

  if (status === "error") {
    return <TriangleAlertIcon className="size-4 text-red-600" />;
  }

  return <LoaderCircleIcon className="size-4 animate-spin text-primary" />;
}

export function ExecutionVisibility({
  message,
  className,
}: {
  message?: ChatMessage;
  className?: string;
}) {
  const { executionEvents } = useDataStream();

  const toolSteps = useMemo(
    () =>
      getToolParts(message).map((part) => ({
        id: `${part.toolCallId ?? part.type}-${part.state}`,
        ...describeToolState(part.type, part.state),
      })),
    [message]
  );

  const activeTool = toolSteps.find((step) => step.status === "running");
  const latestEvent = executionEvents.at(-1);
  const currentAction =
    activeTool?.action ?? latestEvent?.action ?? "Preparing request...";
  const currentTool = activeTool?.tool ?? latestEvent?.tool;
  const currentDetail =
    latestEvent?.detail ??
    (currentTool
      ? `The system is actively working through ${currentTool}.`
      : "Live execution details will appear here as the response progresses.");

  const visibleEvents = executionEvents.slice(-4).map((event, index, events) => ({
    ...event,
    derivedStatus:
      event.kind === "error"
        ? ("error" as const)
        : index === events.length - 1 && !activeTool
          ? ("running" as const)
          : ("completed" as const),
  }));

  return (
    <div
      className={cn(
        "not-prose w-[min(100%,620px)] rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[var(--shadow-card)] backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Execution
          </div>
          <div className="mt-2 font-semibold text-[15px] text-foreground">
            {currentAction}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-muted-foreground">
            {currentDetail}
          </div>
        </div>
        <StatusIcon status={activeTool ? "running" : latestEvent?.kind === "error" ? "error" : "running"} />
      </div>

      {currentTool ? (
        <div className="mt-3">
          <Badge className="gap-1.5 rounded-full" variant="secondary">
            <WrenchIcon className="size-3.5" />
            {currentTool}
          </Badge>
        </div>
      ) : null}

      {visibleEvents.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Progress
          </div>
          {visibleEvents.map((event) => (
            <div
              className="flex items-start gap-2 rounded-xl bg-muted/35 px-3 py-2"
              key={event.id}
            >
              <div className="mt-0.5">
                <StatusIcon status={event.derivedStatus} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] text-foreground">{event.action}</div>
                {event.tool ? (
                  <div className="text-[12px] text-muted-foreground">
                    {event.tool}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {toolSteps.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Tool Chain
          </div>
          {toolSteps.map((step) => (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2"
              key={step.id}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] text-foreground">
                  {step.action}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {step.tool}
                </div>
              </div>
              <Badge
                className="rounded-full"
                variant={step.status === "error" ? "destructive" : "secondary"}
              >
                {step.status === "running"
                  ? "Running"
                  : step.status === "completed"
                    ? "Done"
                    : "Issue"}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
