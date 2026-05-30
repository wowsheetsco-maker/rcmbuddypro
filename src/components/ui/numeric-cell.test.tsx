import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  NumericCell,
  applyNumericSort,
  encodeSort,
  decodeSort,
  type SortState,
} from "./numeric-cell";

function renderCell(children: React.ReactNode) {
  return render(
    <table><tbody><tr><NumericCell data-testid="cell">{children}</NumericCell></tr></tbody></table>,
  );
}

describe("NumericCell", () => {
  it("renders an em-dash for null", () => {
    const { getByTestId } = renderCell(null);
    expect(getByTestId("cell").textContent).toBe("—");
  });

  it("renders an em-dash for undefined", () => {
    const { getByTestId } = renderCell(undefined);
    expect(getByTestId("cell").textContent).toBe("—");
  });

  it("renders an em-dash for empty string", () => {
    const { getByTestId } = renderCell("");
    expect(getByTestId("cell").textContent).toBe("—");
  });

  it("renders the value for 0 (a valid numeric)", () => {
    const { getByTestId } = renderCell("0");
    expect(getByTestId("cell").textContent).toBe("0");
  });

  it("renders the value when present", () => {
    const { getByTestId } = renderCell("₹ 12,345");
    expect(getByTestId("cell").textContent).toBe("₹ 12,345");
  });

  it("applies tabular-nums + right alignment classes", () => {
    const { getByTestId } = renderCell("100");
    const cell = getByTestId("cell");
    expect(cell.className).toMatch(/text-right/);
    expect(cell.className).toMatch(/tabular-nums/);
  });

  it("respects emptyDash=false and renders raw children", () => {
    const { container } = render(
      <table><tbody><tr>
        <NumericCell emptyDash={false}>{null}</NumericCell>
      </tr></tbody></table>,
    );
    expect(container.querySelector("td")?.textContent).toBe("");
  });
});

type Row = { name: string; outstanding: number; age: number };
const rows: Row[] = [
  { name: "A", outstanding: 100, age: 10 },
  { name: "B", outstanding: 300, age: 5 },
  { name: "C", outstanding: 200, age: 30 },
];
const extractors = {
  outstanding: (r: Row) => r.outstanding,
  age: (r: Row) => r.age,
};

describe("applyNumericSort", () => {
  it("returns the original array when sort is empty", () => {
    const out = applyNumericSort(rows, { key: null, dir: null }, extractors);
    expect(out.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("sorts ascending by outstanding", () => {
    const out = applyNumericSort(rows, { key: "outstanding", dir: "asc" }, extractors);
    expect(out.map((r) => r.name)).toEqual(["A", "C", "B"]);
  });

  it("sorts descending by outstanding", () => {
    const out = applyNumericSort(rows, { key: "outstanding", dir: "desc" }, extractors);
    expect(out.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });

  it("sorts ascending by age", () => {
    const out = applyNumericSort(rows, { key: "age", dir: "asc" }, extractors);
    expect(out.map((r) => r.name)).toEqual(["B", "A", "C"]);
  });

  it("sorts descending by age", () => {
    const out = applyNumericSort(rows, { key: "age", dir: "desc" }, extractors);
    expect(out.map((r) => r.name)).toEqual(["C", "A", "B"]);
  });

  it("does not mutate the input array", () => {
    const original = rows.map((r) => r.name);
    applyNumericSort(rows, { key: "age", dir: "desc" }, extractors);
    expect(rows.map((r) => r.name)).toEqual(original);
  });

  it("ignores unknown keys", () => {
    const out = applyNumericSort(
      rows,
      { key: "missing" as "age", dir: "desc" },
      extractors,
    );
    expect(out.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });
});

describe("encodeSort / decodeSort", () => {
  const allowed = ["outstanding", "age"] as const;

  it("encodes active sort", () => {
    expect(encodeSort<"outstanding" | "age">({ key: "outstanding", dir: "desc" })).toBe(
      "outstanding:desc",
    );
  });

  it("encodes empty sort as null", () => {
    expect(encodeSort<"outstanding" | "age">({ key: null, dir: null })).toBeNull();
  });

  it("round-trips a valid value", () => {
    const s: SortState<"outstanding" | "age"> = { key: "age", dir: "asc" };
    expect(decodeSort(encodeSort(s), allowed)).toEqual(s);
  });

  it("rejects unknown keys", () => {
    expect(decodeSort("foo:asc", allowed)).toEqual({ key: null, dir: null });
  });

  it("rejects invalid directions", () => {
    expect(decodeSort("age:sideways", allowed)).toEqual({ key: null, dir: null });
  });

  it("returns empty for null input", () => {
    expect(decodeSort(null, allowed)).toEqual({ key: null, dir: null });
  });
});
