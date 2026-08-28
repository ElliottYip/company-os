import assert from "node:assert/strict";
import test from "node:test";

import {
  parseServiceRuntimeMode,
  validateServiceRuntimeBoundary,
} from "../adapters/http/service-runtime-mode.ts";

test("formal remains the default service runtime mode", () => {
  assert.equal(parseServiceRuntimeMode(undefined), "formal");
  assert.equal(parseServiceRuntimeMode("formal"), "formal");
  assert.throws(() => parseServiceRuntimeMode("demo"), /COMPANY_OS_RUNTIME_MODE_INVALID/);
});

test("public Demo mode requires the explicit Demo flag and no formal or external runtime boundary", () => {
  assert.doesNotThrow(() => validateServiceRuntimeBoundary({
    mode: "public-demo",
    publicDemoEnabled: true,
    formalConfigurationPresent: false,
    connectorConfigurationPresent: false,
  }));
  assert.throws(() => validateServiceRuntimeBoundary({
    mode: "public-demo",
    publicDemoEnabled: false,
    formalConfigurationPresent: false,
    connectorConfigurationPresent: false,
  }), /PUBLIC_DEMO_MODE_REQUIRES_DEMO_ENABLED/);
  assert.throws(() => validateServiceRuntimeBoundary({
    mode: "public-demo",
    publicDemoEnabled: true,
    formalConfigurationPresent: true,
    connectorConfigurationPresent: false,
  }), /PUBLIC_DEMO_MODE_FORMAL_CONFIGURATION_FORBIDDEN/);
  assert.throws(() => validateServiceRuntimeBoundary({
    mode: "public-demo",
    publicDemoEnabled: true,
    formalConfigurationPresent: false,
    connectorConfigurationPresent: true,
  }), /PUBLIC_DEMO_MODE_EXTERNAL_RUNTIME_FORBIDDEN/);
});

test("formal mode cannot expose the anonymous Demo surface", () => {
  assert.throws(() => validateServiceRuntimeBoundary({
    mode: "formal",
    publicDemoEnabled: true,
    formalConfigurationPresent: true,
    connectorConfigurationPresent: true,
  }), /FORMAL_MODE_PUBLIC_DEMO_FORBIDDEN/);
});
