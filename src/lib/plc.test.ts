import { describe, test } from "node:test";
import assert from "node:assert/strict";
const expect = (actual: unknown) => ({ toBe: (value: unknown) => assert.equal(actual, value), toHaveLength: (value: number) => assert.equal(Array.isArray(actual) ? actual.length : -1, value), toThrow: () => { if (typeof actual !== "function") throw new Error("Expected function"); assert.throws(() => actual()); } });
import { EMPTY_RUNTIME, hmiSize, hmiValue, hmiMotion, formatHmiValue, nextHmiPosition, parseProject, projectErrors, scanProject, type HmiWidget, type SimulatorProject } from "./plc";

const project = (instructions: SimulatorProject["rungs"][number]["instructions"]): SimulatorProject => ({ name: "Teste", rungs: [{ id: "r", title: "Rede", instructions }], widgets: [] });
describe("Ladder e tags IHM", () => {
  test("ramal de selo mantém bobina até contato NF interromper", () => {
    const p = project([{ id: "start", type: "contact-no", tag: "I0.0", parallel: [{ tag: "Q0.0", normallyClosed: false }] }, { id: "stop", type: "contact-nc", tag: "I0.1" }, { id: "coil", type: "coil", tag: "Q0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 0);
    expect(r.bits["Q0.0"]).toBe(true);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": false } }, 100, 100);
    expect(r.bits["Q0.0"]).toBe(true);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.1": true } }, 100, 200);
    expect(r.bits["Q0.0"]).toBe(false);
  });
  test("SET/RESET escreve memória retentiva em ordem de scan", () => {
    const p = project([{ id: "a", type: "contact-no", tag: "I0.0" }, { id: "b", type: "coil-set", tag: "M0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 0);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": false } }, 100, 100);
    expect(r.bits["M0.0"]).toBe(true);
    expect(scanProject(project([{ id: "b", type: "coil-reset", tag: "M0.0" }]), r, 100, 200).bits["M0.0"]).toBe(false);
  });
  test("TON done pode ser contato e TOF não liga antes da entrada", () => {
    const p = project([{ id: "a", type: "contact-no", tag: "M0.0" }, { id: "t", type: "ton", tag: "T1", preset: 200 }, { id: "done", type: "contact-no", tag: "T1" }, { id: "q", type: "coil", tag: "Q0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "M0.0": true } }, 100, 0);
    expect(r.bits["Q0.0"]).toBe(false);
    r = scanProject(p, r, 100, 100);
    expect(r.bits["Q0.0"]).toBe(true);
    expect(r.timers["T1"]?.elapsed).toBe(200);
    const off = project([{ id: "a", type: "contact-no", tag: "I0.0" }, { id: "t", type: "tof", tag: "T2", preset: 200 }]);
    expect(scanProject(off, EMPTY_RUNTIME, 100, 0).timers["T2"]?.done).toBe(false);
    r = scanProject(off, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 0);
    r = scanProject(off, { ...r, bits: { "I0.0": false } }, 100, 100);
    expect(r.timers["T2"]?.done).toBe(true);
    expect(scanProject(off, r, 100, 300).timers["T2"]?.done).toBe(false);
  });
  test("importação rejeita conteúdo quebrado e tags de escrita inválidas", () => {
    expect(() => parseProject({ name: "x", rungs: [{}], widgets: [] })).toThrow();
    expect(projectErrors({ ...project([]), widgets: [{ id: "w", type: "button-on", x: 40, y: 40, label: "Ligar", tag: "Q0.0" }] })).toHaveLength(1);
    expect(projectErrors(project([{ id: "i", type: "contact-no", tag: "T1" }]))).toHaveLength(0);
  });
  test("TON em série só aciona a bobina após o tempo programado", () => {
    const p = project([{ id: "i", type: "contact-no", tag: "I0.0" }, { id: "t", type: "ton", tag: "T1", preset: 300 }, { id: "q", type: "coil", tag: "Q0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 0);
    expect(r.bits["Q0.0"]).toBe(false);
    r = scanProject(p, r, 100, 100);
    expect(r.bits["Q0.0"]).toBe(false);
    r = scanProject(p, r, 100, 200);
    expect(r.bits["Q0.0"]).toBe(true);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": false } }, 100, 300);
    expect(r.bits["Q0.0"]).toBe(false);
  });
  test("TOF em série mantém a bobina durante o atraso de desligamento", () => {
    const p = project([{ id: "i", type: "contact-no", tag: "I0.0" }, { id: "t", type: "tof", tag: "T1", preset: 300 }, { id: "q", type: "coil", tag: "Q0.0" }]);
    expect(scanProject(p, EMPTY_RUNTIME, 100, 0).bits["Q0.0"]).toBe(false);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 100);
    expect(r.bits["Q0.0"]).toBe(true);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": false } }, 100, 200);
    expect(r.bits["Q0.0"]).toBe(true);
    expect(scanProject(p, r, 100, 500).bits["Q0.0"]).toBe(false);
  });
  test("novos instrumentos recebem posições sem sobreposição", () => {
    const widgets: HmiWidget[] = [];
    for (const type of ["conveyor", "motor", "display", "gauge", "chart", "button-on", "lamp"] as const) {
      const position = nextHmiPosition(widgets, type);
      assert.ok(position);
      const size = hmiSize(type);
      for (const previous of widgets) {
        const other = hmiSize(previous.type);
        assert.ok(position.x >= previous.x + other.width || position.x + size.width <= previous.x || position.y >= previous.y + other.height || position.y + size.height <= previous.y);
      }
      widgets.push({ id: type, type, ...position, tag: "Q0.0", label: type });
    }
  });
  test("CTU conta bordas, aciona saída no PV e reset tem prioridade", () => {
    const p = project([{ id: "sensor", type: "contact-no", tag: "I0.0" }, { id: "c", type: "ctu", tag: "C1", preset: 2, resetTag: "I0.1" }, { id: "q", type: "coil", tag: "Q0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true } }, 100, 0);
    expect(r.counters?.C1?.current).toBe(1);
    r = scanProject(p, r, 100, 100);
    expect(r.counters?.C1?.current).toBe(1);
    expect(r.bits["Q0.0"]).toBe(false);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": false } }, 100, 200);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.0": true } }, 100, 300);
    expect(r.counters?.C1?.current).toBe(2);
    expect(r.bits["Q0.0"]).toBe(true);
    r = scanProject(p, { ...r, bits: { ...r.bits, "I0.1": true } }, 100, 400);
    expect(r.counters?.C1?.current).toBe(0);
    expect(r.bits["Q0.0"]).toBe(false);
  });
  test("CTD carrega PV, conta descidas por pulso e não passa de zero", () => {
    const p = project([{ id: "s", type: "contact-no", tag: "I0.0" }, { id: "c", type: "ctd", tag: "C2", preset: 2, loadTag: "M0.0" }]);
    let r = scanProject(p, { ...EMPTY_RUNTIME, bits: { "I0.0": true, "M0.0": true } }, 100, 0);
    expect(r.counters?.C2?.current).toBe(2);
    r = scanProject(p, { ...r, bits: { "I0.0": true, "M0.0": false } }, 100, 100);
    expect(r.counters?.C2?.current).toBe(2);
    for (let i = 0; i < 3; i++) {
      r = scanProject(p, { ...r, bits: { "I0.0": false } }, 100, 200 + i * 200);
      r = scanProject(p, { ...r, bits: { "I0.0": true } }, 100, 300 + i * 200);
    }
    expect(r.counters?.C2?.current).toBe(0);
    expect(r.counters?.C2?.done).toBe(true);
  });
  test("RES zera contador e validação bloqueia instâncias duplicadas e PV inválido", () => {
    const p = project([{ id: "c", type: "ctu", tag: "C1", preset: 2 }, { id: "r", type: "counter-reset", tag: "C1" }]);
    expect(scanProject(p, EMPTY_RUNTIME, 100, 0).counters?.C1?.current).toBe(0);
    expect(projectErrors(project([{ id: "a", type: "ctu", tag: "C1" }, { id: "b", type: "ctd", tag: "C1" }]))).toHaveLength(1);
    expect(projectErrors(project([{ id: "c", type: "ctu", tag: "C1", preset: 1.5 }]))).toHaveLength(1);
  });
  test("MOV leva contagem a MW e IHM limita movimento horizontal e vertical", () => {
    const widget: HmiWidget = { id: "w", type: "conveyor", x: 40, y: 64, tag: "MW10", label: "Esteira", min: 0, max: 2, travel: 400 };
    const p = { ...project([{ id: "c", type: "ctu", tag: "C1", preset: 2 }, { id: "m", type: "mov", source: "C1", tag: "MW10" }]), widgets: [widget] };
    let r = scanProject(p, EMPTY_RUNTIME, 100, 0);
    expect(r.words?.MW10).toBe(undefined);
    const move = project([{ id: "m", type: "mov", source: "C1", tag: "MW10" }]);
    r = scanProject(move, { ...r, counters: { C1: { current: 1, preset: 2, done: false, input: false } } }, 100, 100);
    expect(r.words?.MW10).toBe(1);
    expect(hmiValue(widget, r)).toBe(1);
    expect(hmiMotion(widget, r)).toBe(200);
    expect(hmiMotion({ ...widget, direction: "vertical", travel: 130 }, r)).toBe(65);
    expect(hmiMotion(widget, { ...r, words: { MW10: 10 } })).toBe(400);
    expect(hmiMotion(widget, { ...r, words: { MW10: -10 } })).toBe(0);
    expect(formatHmiValue(125, { ...widget, digits: 4 })).toBe("0125");
    expect(parseProject(p).widgets[0]?.type).toBe("conveyor");
    expect(projectErrors(p)).toHaveLength(0);
  });
});