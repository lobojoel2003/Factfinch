import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "");
  // jsdom doesn't implement these.
  window.scrollTo = () => {};
  window.print = () => {};
});

afterEach(() => cleanup());
