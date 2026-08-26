import type { CompanyStructure } from "../core/company-structure.ts";
import type { Identifier } from "../core/control-plane.ts";
import { CompanyRegistry } from "./company-registry.ts";

export interface InitialOrganizationSetupInput {
  readonly company: {
    readonly id: Identifier;
    readonly name: string;
    readonly purpose: string;
    readonly locale: string;
  };
  readonly owner: {
    readonly id: Identifier;
    readonly name: string;
    readonly title: string;
  };
  readonly departmentName: string;
}

export class SetupInitialOrganization {
  readonly #registry: CompanyRegistry;
  readonly #nextId: () => Identifier;

  constructor(dependencies: { readonly registry: CompanyRegistry; readonly nextId: () => Identifier }) {
    this.#registry = dependencies.registry;
    this.#nextId = dependencies.nextId;
  }

  execute(input: InitialOrganizationSetupInput): Promise<CompanyStructure> {
    const departmentId = this.#nextId();
    const positionId = this.#nextId();
    const workspaceId = this.#nextId();
    return this.#registry.register({
      organization: {
        company: { ...input.company },
        departments: [{
          id: departmentId,
          name: input.departmentName,
          mandate: input.company.purpose,
        }],
        humans: [{
          id: input.owner.id,
          name: input.owner.name,
          title: input.owner.title,
          departmentId,
          avatarId: "human-default",
        }],
        agents: [],
      },
      projects: [],
      workspaces: [{
        id: workspaceId,
        name: `${input.departmentName.trim()} workspace`,
        projectId: null,
        departmentId,
      }],
      positions: [{
        id: positionId,
        title: input.owner.title,
        departmentId,
        principalId: input.owner.id,
        accountableHumanId: input.owner.id,
      }],
      reportingLines: [],
    });
  }
}
