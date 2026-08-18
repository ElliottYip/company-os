import test from "node:test";

import { runConnectorConformance } from "../connector-sdk/conformance.ts";
import { JournalFixtureConnector } from "../adapters/connectors/journal-fixture-connector.ts";
import { StateMachineFixtureConnector } from "../adapters/connectors/state-machine-fixture-connector.ts";

test("state-machine fixture connector satisfies the neutral connector contract", async () => {
  await runConnectorConformance(() => new StateMachineFixtureConnector("fixture-state-machine"));
});

test("journal fixture connector satisfies the same neutral connector contract", async () => {
  await runConnectorConformance(() => new JournalFixtureConnector("fixture-journal"));
});
