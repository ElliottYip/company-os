export type ServiceRuntimeMode = "formal" | "public-demo";

export function parseServiceRuntimeMode(value: string | undefined): ServiceRuntimeMode {
  if (value === undefined || value.trim() === "" || value === "formal") return "formal";
  if (value === "public-demo") return value;
  throw new Error("COMPANY_OS_RUNTIME_MODE_INVALID");
}

export function validateServiceRuntimeBoundary(input: {
  readonly mode: ServiceRuntimeMode;
  readonly publicDemoEnabled: boolean;
  readonly formalConfigurationPresent: boolean;
  readonly connectorConfigurationPresent: boolean;
}): void {
  if (input.mode === "formal") {
    if (input.publicDemoEnabled) throw new Error("FORMAL_MODE_PUBLIC_DEMO_FORBIDDEN");
    return;
  }
  if (!input.publicDemoEnabled) throw new Error("PUBLIC_DEMO_MODE_REQUIRES_DEMO_ENABLED");
  if (input.formalConfigurationPresent) {
    throw new Error("PUBLIC_DEMO_MODE_FORMAL_CONFIGURATION_FORBIDDEN");
  }
  if (input.connectorConfigurationPresent) {
    throw new Error("PUBLIC_DEMO_MODE_EXTERNAL_RUNTIME_FORBIDDEN");
  }
}
