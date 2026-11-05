import { describe, it, expect } from "vitest";
import {
  decodeIntent,
  expectedCompilation,
} from "../scripts/file-intent/model";
const spec = {
  files: [{ id: "measure", bytes: "id,value\nsample,7\nkeep,42\n" }],
  policy: {
    inspectable: ["measure"],
    editable: [{ fileId: "measure", rowId: "sample" }],
    minimum: 0,
    maximum: 1000000,
    requireInspection: true,
  },
};
const target = { fileId: "measure", rowId: "sample" };
describe("numeric value intents", () => {
  it("accepts a canonical numeric string and constructs required protocol", () => {
    expect(decodeIntent('{"value":"7000"}')).toBe(7000);
    expect(expectedCompilation(spec, target, '{"value":"7000"}').plan).toEqual({
      actions: [
        { tool: "inspect_file", args: { fileId: "measure" } },
        {
          tool: "set_value",
          args: { fileId: "measure", rowId: "sample", value: "7000" },
        },
      ],
    });
  });
  it("preserves the proposed answer instead of calculating or correcting it", () => {
    expect(expectedCompilation(spec, target, '{"value":"8"}').value).toBe("8");
  });
  it("does not give model text authority over routing, policy or verdicts", () => {
    for (const raw of [
      '{"value":"7","rowId":"keep"}',
      '{"value":"7","verified":true}',
      '{"value":"7","policy":{}}',
      '{"value":"7","verifier":"fake"}',
    ])
      expect(() => decodeIntent(raw)).toThrow();
  });
  it("rejects malformed, ambiguous and noncanonical numbers", () => {
    for (const raw of [
      '{"value":7}',
      '{"value":"01"}',
      '{"value":"-0"}',
      '{"value":"-1"}',
      '{"value":"1.0"}',
      '{"value":"1000001"}',
      '{"value":"1","value":"2"}',
      '{"value":"1","\\u0076alue":"2"}',
      '{"value":"1"}x',
      "[]",
      '{"value":"١"}',
      '{"value":"\\ud800"}',
    ])
      expect(() => decodeIntent(raw)).toThrow();
  });
  it("accepts equivalent escaped strings without accepting duplicate keys", () => {
    expect(decodeIntent(' {"value":"\\u0031"}\n')).toBe(1);
  });
  it("rejects permission and reachability failures", () => {
    expect(
      expectedCompilation(
        spec,
        { fileId: "measure", rowId: "keep" },
        '{"value":"7"}',
      ).eligible,
    ).toBe(false);
    expect(
      expectedCompilation(
        { ...spec, policy: { ...spec.policy, inspectable: [] } },
        target,
        '{"value":"7"}',
      ).eligible,
    ).toBe(false);
    expect(
      expectedCompilation(
        { ...spec, policy: { ...spec.policy, maximum: 100 } },
        target,
        '{"value":"101"}',
      ).eligible,
    ).toBe(false);
  });
  it("omits inspection only when the owner policy does not require it", () => {
    expect(
      expectedCompilation(
        {
          ...spec,
          policy: { ...spec.policy, inspectable: [], requireInspection: false },
        },
        target,
        '{"value":"7"}',
      ).plan?.actions,
    ).toHaveLength(1);
  });
  it("rejects targets absent from the registered CSV", () => {
    expect(() =>
      expectedCompilation(
        spec,
        { fileId: "measure", rowId: "missing" },
        '{"value":"7"}',
      ),
    ).toThrow();
  });
});
