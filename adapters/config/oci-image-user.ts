export interface OciImageUser {
  readonly uid: number;
  readonly gid: number;
}

export interface OciImageUserInspection {
  readonly image: string;
  readonly declaredUser: string;
  readonly passwdContents: string;
  readonly groupContents: string;
}

const IMMUTABLE_IMAGE =
  /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?@sha256:[a-f0-9]{64}$/;

export function createOciImageUserResolver(
  inspections: readonly OciImageUserInspection[],
): (image: string, explicitUser?: string | null) => OciImageUser {
  const indexed = new Map<string, OciImageUserInspection>();
  for (const inspection of inspections) {
    if (typeof inspection.image !== "string" || !IMMUTABLE_IMAGE.test(inspection.image) ||
        indexed.has(inspection.image) || typeof inspection.declaredUser !== "string" ||
        typeof inspection.passwdContents !== "string" || typeof inspection.groupContents !== "string") {
      throw new Error("OCI_IMAGE_USER_INSPECTION_INVALID");
    }
    indexed.set(inspection.image, inspection);
  }
  return (image, explicitUser) => {
    const inspection = indexed.get(image);
    if (!inspection) throw new Error("OCI_IMAGE_USER_INSPECTION_MISSING");
    return resolveOciImageUser(explicitUser ?? inspection.declaredUser,
      inspection.passwdContents, inspection.groupContents);
  };
}

interface PasswdEntry {
  readonly name: string;
  readonly uid: number;
  readonly gid: number;
}

interface GroupEntry {
  readonly name: string;
  readonly gid: number;
}

export function resolveOciImageUser(
  declaredUser: string,
  passwdContents: string,
  groupContents: string,
): OciImageUser {
  if (typeof declaredUser !== "string" || declaredUser.length === 0 || declaredUser.trim() !== declaredUser ||
      declaredUser.includes("\0")) {
    throw new Error("OCI_IMAGE_USER_DECLARATION_INVALID");
  }
  const parts = declaredUser.split(":");
  const userToken = parts[0]; const groupToken = parts[1];
  if (parts.length > 2 || userToken === undefined || userToken.length === 0 ||
      (parts.length === 2 && (groupToken === undefined || groupToken.length === 0))) {
    throw new Error("OCI_IMAGE_USER_DECLARATION_INVALID");
  }

  const passwd = parsePasswd(passwdContents);
  const groups = parseGroups(groupContents);
  const user = numericToken(userToken) === null
    ? unique(passwd.filter((entry) => entry.name === userToken), "OCI_IMAGE_USER_NOT_FOUND_OR_AMBIGUOUS")
    : unique(passwd.filter((entry) => entry.uid === numericToken(userToken)),
      "OCI_IMAGE_USER_NOT_FOUND_OR_AMBIGUOUS");

  const gid = groupToken === undefined ? user.gid : resolveGroup(groupToken, groups);
  if (!validId(user.uid) || !validId(gid)) throw new Error("OCI_IMAGE_USER_ROOT_OR_RANGE_INVALID");
  return { uid: user.uid, gid };
}

function resolveGroup(token: string, groups: readonly GroupEntry[]): number {
  const numeric = numericToken(token);
  const group = numeric === null
    ? unique(groups.filter((entry) => entry.name === token), "OCI_IMAGE_GROUP_NOT_FOUND_OR_AMBIGUOUS")
    : unique(groups.filter((entry) => entry.gid === numeric), "OCI_IMAGE_GROUP_NOT_FOUND_OR_AMBIGUOUS");
  return group.gid;
}

function parsePasswd(contents: string): readonly PasswdEntry[] {
  if (typeof contents !== "string" || contents.includes("\0")) throw new Error("OCI_IMAGE_PASSWD_INVALID");
  return nonCommentLines(contents).map((line) => {
    const fields = line.split(":");
    const name = fields[0]; const uidToken = fields[2]; const gidToken = fields[3];
    if (fields.length !== 7 || name === undefined || name.length === 0 ||
        uidToken === undefined || gidToken === undefined) throw new Error("OCI_IMAGE_PASSWD_INVALID");
    const uid = numericToken(uidToken); const gid = numericToken(gidToken);
    if (uid === null || gid === null) throw new Error("OCI_IMAGE_PASSWD_INVALID");
    return { name, uid, gid };
  });
}

function parseGroups(contents: string): readonly GroupEntry[] {
  if (typeof contents !== "string" || contents.includes("\0")) throw new Error("OCI_IMAGE_GROUP_INVALID");
  return nonCommentLines(contents).map((line) => {
    const fields = line.split(":");
    const name = fields[0]; const gidToken = fields[2];
    if (fields.length !== 4 || name === undefined || name.length === 0 || gidToken === undefined) {
      throw new Error("OCI_IMAGE_GROUP_INVALID");
    }
    const gid = numericToken(gidToken);
    if (gid === null) throw new Error("OCI_IMAGE_GROUP_INVALID");
    return { name, gid };
  });
}

function nonCommentLines(contents: string): string[] {
  return contents.split("\n").filter((line) => line.length > 0 && !line.startsWith("#"));
}

function numericToken(value: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function unique<T>(values: readonly T[], error: string): T {
  if (values.length !== 1) throw new Error(error);
  return values[0] as T;
}

function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 65_535;
}
