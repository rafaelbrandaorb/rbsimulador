export type InstructionType = "contact-no" | "contact-nc" | "coil" | "ton" | "tof";

export type Instruction = {
  id: string;
  type: InstructionType;
  tag: string;
  preset?: number;
  comment?: string;
};

export type Rung = { id: string; title: string; instructions: Instruction[] };
export type HmiWidgetType = "lamp" | "button-on" | "button-off" | "text" | "value";
export type HmiWidget = {
  id: string;
  type: HmiWidgetType;
  x: number;
  y: number;
  tag: string;
  label: string;
};

export type TimerValue = { elapsed: number; preset: number; done: boolean; input: boolean; offStartedAt?: number };
export type Runtime = {
  bits: Record<string, boolean>;
  timers: Record<string, TimerValue>;
  powered: Record<string, boolean>;
};

export type SimulatorProject = {
  name: string;
  rungs: Rung[];
  widgets: HmiWidget[];
};

export const EMPTY_RUNTIME: Runtime = { bits: {}, timers: {}, powered: {} };

export function normalizeTag(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validTag(tag: string, timer = false) {
  return timer ? /^T\d+$/.test(tag) : /^[IQM]\d+\.\d+$/.test(tag);
}

export function scanProject(project: SimulatorProject, runtime: Runtime, scanMs: number, now: number): Runtime {
  const bits = { ...runtime.bits };
  const timers = { ...runtime.timers };
  const powered: Record<string, boolean> = {};

  for (const rung of project.rungs) {
    let power = true;
    for (const instruction of rung.instructions) {
      if (instruction.type === "contact-no") power = power && Boolean(bits[instruction.tag] ?? timers[instruction.tag]?.done);
      if (instruction.type === "contact-nc") power = power && !Boolean(bits[instruction.tag] ?? timers[instruction.tag]?.done);

      if (instruction.type === "ton") {
        const previous = timers[instruction.tag] ?? { elapsed: 0, preset: instruction.preset ?? 2000, done: false, input: false };
        const elapsed = power ? (previous.input ? previous.elapsed + scanMs : scanMs) : 0;
        timers[instruction.tag] = {
          elapsed,
          preset: instruction.preset ?? 2000,
          done: power && elapsed >= (instruction.preset ?? 2000),
          input: power,
        };
      }

      if (instruction.type === "tof") {
        const previous = timers[instruction.tag] ?? { elapsed: 0, preset: instruction.preset ?? 2000, done: false, input: false };
        const offStartedAt = power ? undefined : previous.input ? now : previous.offStartedAt ?? now;
        const elapsed = power ? 0 : Math.min(now - offStartedAt, instruction.preset ?? 2000);
        timers[instruction.tag] = {
          elapsed,
          preset: instruction.preset ?? 2000,
          done: power || elapsed < (instruction.preset ?? 2000),
          input: power,
          offStartedAt,
        };
      }

      if (instruction.type === "coil") bits[instruction.tag] = power;
      powered[instruction.id] = power;
    }
  }

  return { bits, timers, powered };
}

export function collectTags(project: SimulatorProject, runtime: Runtime) {
  const tags = new Set<string>(Object.keys(runtime.bits));
  Object.keys(runtime.timers).forEach((tag) => tags.add(tag));
  project.rungs.forEach((rung) => rung.instructions.forEach((instruction) => tags.add(instruction.tag)));
  project.widgets.forEach((widget) => widget.tag && tags.add(widget.tag));
  return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}