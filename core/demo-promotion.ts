import type { OrganizationDraft } from "./organization.ts";

export interface FormalOrganizationTemplate {
  readonly templateVersion: "1.0";
  readonly source: "SANITIZED_DEMO_TEMPLATE";
  readonly company: {
    readonly suggestedName: string;
    readonly purpose: string;
    readonly locale: string;
  };
  readonly departments: readonly {
    readonly suggestedName: string;
    readonly mandate: string;
  }[];
  readonly rebindRequirements: readonly [
    "IDENTITY",
    "HUMANS",
    "AGENTS",
    "PERMISSIONS",
    "DATA_AUTHORIZATIONS",
    "RESPONSIBILITY_CONTRACTS",
  ];
}

export function createFormalTemplateFromDemo(
  organization: OrganizationDraft,
): FormalOrganizationTemplate {
  return {
    templateVersion: "1.0",
    source: "SANITIZED_DEMO_TEMPLATE",
    company: {
      suggestedName: organization.company.name,
      purpose: organization.company.purpose,
      locale: organization.company.locale,
    },
    departments: organization.departments.map(({ name, mandate }) => ({
      suggestedName: name,
      mandate,
    })),
    rebindRequirements: [
      "IDENTITY",
      "HUMANS",
      "AGENTS",
      "PERMISSIONS",
      "DATA_AUTHORIZATIONS",
      "RESPONSIBILITY_CONTRACTS",
    ],
  };
}
