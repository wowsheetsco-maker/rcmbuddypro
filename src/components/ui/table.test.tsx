import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";

beforeAll(() => {
  // jsdom doesn't implement ResizeObserver
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderTable(opts?: { wide?: boolean }) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead priority="primary">Claim</TableHead>
          <TableHead priority="secondary">Patient</TableHead>
          <TableHead priority="tertiary">TPA</TableHead>
          <TableHead priority="supporting">Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell priority="primary">CL-1</TableCell>
          <TableCell priority="secondary">Patient A</TableCell>
          <TableCell priority="tertiary">TPA A</TableCell>
          <TableCell priority="supporting">memo</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table responsive priorities", () => {
  it("primary columns have no hidden class", () => {
    const { container } = renderTable();
    const cell = container.querySelector('th[data-priority="primary"]');
    expect(cell?.className).not.toMatch(/hidden/);
  });

  it("secondary columns are hidden until sm breakpoint", () => {
    const { container } = renderTable();
    const cell = container.querySelector('th[data-priority="secondary"]');
    expect(cell?.className).toMatch(/hidden/);
    expect(cell?.className).toMatch(/sm:table-cell/);
  });

  it("tertiary columns are hidden until md breakpoint", () => {
    const { container } = renderTable();
    const cell = container.querySelector('th[data-priority="tertiary"]');
    expect(cell?.className).toMatch(/hidden/);
    expect(cell?.className).toMatch(/md:table-cell/);
  });

  it("supporting columns are hidden until lg breakpoint", () => {
    const { container } = renderTable();
    const cell = container.querySelector('td[data-priority="supporting"]');
    expect(cell?.className).toMatch(/hidden/);
    expect(cell?.className).toMatch(/lg:table-cell/);
  });
});

describe("Table sticky header", () => {
  it("applies sticky top-0 by default", () => {
    const { container } = renderTable();
    const head = container.querySelector("thead");
    expect(head?.className).toMatch(/sticky/);
    expect(head?.className).toMatch(/top-0/);
  });
});

describe("Table scroll buttons", () => {
  it("renders scroll buttons when content overflows; left disabled at start", () => {
    const { container, getByTestId } = renderTable();
    const scroll = container.querySelector("[data-table-scroll-container]") as HTMLDivElement;
    Object.defineProperty(scroll, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroll, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scroll, "scrollLeft", { value: 0, configurable: true, writable: true });
    act(() => {
      scroll.dispatchEvent(new Event("scroll"));
    });
    expect(getByTestId("table-scroll-right")).toBeInTheDocument();
    expect(getByTestId("table-scroll-right")).not.toBeDisabled();
    expect(getByTestId("table-scroll-left")).toBeDisabled();
  });

  it("scrollBy is called when right button clicked", () => {
    const { container, getByTestId } = renderTable();
    const scroll = container.querySelector("[data-table-scroll-container]") as HTMLDivElement;
    Object.defineProperty(scroll, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(scroll, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(scroll, "scrollLeft", { value: 0, configurable: true, writable: true });
    const spy = vi.fn();
    scroll.scrollBy = spy as unknown as typeof scroll.scrollBy;
    act(() => {
      scroll.dispatchEvent(new Event("scroll"));
    });
    fireEvent.click(getByTestId("table-scroll-right"));
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].left).toBeGreaterThan(0);
  });
});

/* ---------- Responsive layout breakpoint smoke tests ---------- */

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

describe("Responsive breakpoints", () => {
  it("at 375px (mobile) tertiary/supporting columns retain hidden classes", () => {
    setViewport(375);
    const { container } = renderTable();
    const tert = container.querySelector('th[data-priority="tertiary"]');
    const sup = container.querySelector('th[data-priority="supporting"]');
    expect(tert?.className).toMatch(/hidden/);
    expect(sup?.className).toMatch(/hidden/);
  });

  it("at 768px (tablet) tertiary columns become visible via md:table-cell", () => {
    setViewport(768);
    const { container } = renderTable();
    const tert = container.querySelector('th[data-priority="tertiary"]');
    expect(tert?.className).toMatch(/md:table-cell/);
  });
});
