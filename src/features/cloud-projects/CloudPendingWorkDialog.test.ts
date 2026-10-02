import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudPendingWorkDialog } from "./CloudPendingWorkDialog";

describe("CloudPendingWorkDialog", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("makes saving the primary leave action and Escape keeps the editor open", async () => {
    const onSave = vi.fn();
    const onStay = vi.fn();
    await act(async () => root.render(createElement(CloudPendingWorkDialog, {
      destination: "leave this project", actionTarget: "leave", deviceDraft: false, blocked: false, retry: false,
      replacesRedo: false, busy: false, error: null, onSave, onStay,
    })));
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(container.textContent).toContain("Save edit and leave");
    expect(container.textContent).not.toContain("Discard");
    await act(async () => (container.querySelector('[data-testid="save-and-continue"]') as HTMLButtonElement).click());
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onStay).toHaveBeenCalledOnce();
  });

  it("does not offer a cloud save for unfinished work that cannot be committed", async () => {
    await act(async () => root.render(createElement(CloudPendingWorkDialog, {
      destination: "switch tools", actionTarget: "switch tools", deviceDraft: true, blocked: true, retry: false,
      replacesRedo: false, busy: false, error: null, onSave: vi.fn(), onStay: vi.fn(),
    })));
    expect(container.textContent).toContain("Finish this edit first");
    expect(container.querySelector('[data-testid="save-and-continue"]')).toBeNull();
    expect(container.textContent).toContain("Keep editing");
  });
});
