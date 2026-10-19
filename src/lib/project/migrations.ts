import {
  PROJECT_FORMAT,
  ProjectDocument,
  SCHEMA_VERSION,
  type ProjectDocument as ProjectDocumentType,
} from './schema';

export interface MigrationResult {
  project: ProjectDocumentType;
  fromVersion: number;
  applied: string[];
  warnings: string[];
}

type Migration = {
  from: number;
  to: number;
  description: string;
  run: (raw: Record<string, unknown>, warnings: string[]) => Record<string, unknown>;
};

/**
 * Migration steps run in order. Each step receives untrusted JSON and must
 * return JSON for the next step. Unknown optional fields are preserved when
 * possible so a newer project does not silently lose data on a round trip.
 */
const MIGRATIONS: Migration[] = [
  {
    from: 0,
    to: 1,
    description: 'Normalize the pre-versioned development format into schema version 1.',
    run: (raw, warnings) => {
      const project = isRecord(raw.project) ? raw.project : raw;
      const defaults = createMigrationDefaults();
      const vehicle = isRecord(project.vehicle) ? project.vehicle : {};
      const panels = Array.isArray(vehicle.panels) ? vehicle.panels : [];
      if (panels.length === 0) {
        warnings.push('Project had no vehicle panels; vehicle setup will need attention.');
      }
      return {
        ...project,
        schemaVersion: 1,
        name: typeof project.name === 'string' && project.name ? project.name : 'Recovered project',
        description: typeof project.description === 'string' ? project.description : '',
        createdAt: typeof project.createdAt === 'string' ? project.createdAt : defaults.createdAt,
        updatedAt: new Date().toISOString(),
        artwork: Array.isArray(project.artwork) ? project.artwork : [],
        placements: Array.isArray(project.placements) ? project.placements : [],
        print: isRecord(project.print) ? project.print : defaults.print,
        render: isRecord(project.render) ? project.render : defaults.render,
        settings: isRecord(project.settings) ? project.settings : defaults.settings,
      };
    },
  },
  {
    from: 1,
    to: 2,
    description: 'Add the texture livery model (paint layers, strokes, finish).',
    run: (raw) => {
      const project = isRecord(raw.project) ? raw.project : raw;
      const vehicle = isRecord(project.vehicle) ? project.vehicle : {};
      return {
        ...project,
        schemaVersion: 2,
        vehicle: {
          ...vehicle,
          livery: isRecord(vehicle.livery)
            ? vehicle.livery
            : {
                enabled: false,
                resolution: 2048,
                baseTexturePath: null,
                baseTextureSize: 1024,
                finish: { mode: 'tint', color: '#121821', strength: 0.9 },
                layers: [],
                strokes: [],
              },
        },
      };
    },
  },
];

function createMigrationDefaults(): {
  createdAt: string;
  print: Record<string, unknown>;
  render: Record<string, unknown>;
  settings: Record<string, unknown>;
} {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    print: {
      unit: 'mm',
      scale: 1,
      dpi: 150,
      bleedMm: 3,
      safeMarginMm: 5,
      colorMode: 'rgb',
      includeRegistrationMarks: true,
      includePanelLabels: true,
      panelSelectionMode: 'all',
      panelIds: [],
    },
    render: {
      preset: 'preview',
      width: 1600,
      height: 1000,
      engine: 'BLENDER_EEVEE',
      samples: 32,
      camera: 'three-quarter-front',
      transparentBackground: false,
      includeFloor: true,
    },
    settings: {
      showGrid: true,
      showPanelEdges: true,
      showUvSeams: false,
      gridSizeMm: 250,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function detectSchemaVersion(rawEnvelope: unknown): number {
  if (!isRecord(rawEnvelope)) return 0;
  if (isRecord(rawEnvelope.project)) {
    const version = rawEnvelope.project.schemaVersion;
    return typeof version === 'number' && Number.isInteger(version) ? version : 0;
  }
  const version = rawEnvelope.schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) ? version : 0;
}

export function unwrapProject(rawEnvelope: unknown): Record<string, unknown> {
  if (!isRecord(rawEnvelope)) {
    throw new Error('Project file is not a JSON object.');
  }
  if (rawEnvelope.format !== undefined && rawEnvelope.format !== PROJECT_FORMAT) {
    throw new Error(`Unsupported project format: ${String(rawEnvelope.format)}`);
  }
  if (isRecord(rawEnvelope.project)) return rawEnvelope.project;
  return rawEnvelope;
}

/**
 * Migrates an untrusted envelope or bare project object up to the current
 * schema. Validation happens after migration by the caller.
 */
export function migrateProject(rawEnvelope: unknown): MigrationResult {
  let raw = unwrapProject(rawEnvelope);
  const fromVersion = detectSchemaVersion(rawEnvelope);
  const applied: string[] = [];
  const warnings: string[] = [];

  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `This project was created by a newer version of WrapForge (schema ${fromVersion}). ` +
        `This build supports schema ${SCHEMA_VERSION}. Update WrapForge to open it.`,
    );
  }

  let current = fromVersion;
  while (current < SCHEMA_VERSION) {
    const migration = MIGRATIONS.find((step) => step.from === current);
    if (!migration) {
      throw new Error(`No migration path from schema ${current} to ${SCHEMA_VERSION}.`);
    }
    raw = migration.run(raw, warnings);
    current = migration.to;
    applied.push(`${migration.from} -> ${migration.to}: ${migration.description}`);
  }

  if (current !== SCHEMA_VERSION) {
    throw new Error(`No migration path from schema ${current} to ${SCHEMA_VERSION}.`);
  }

  const parsed = ProjectDocument.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Project data is invalid after migration:\n${formatIssues(parsed.error)}`);
  }

  return {
    project: parsed.data,
    fromVersion,
    applied,
    warnings,
  };
}

export function formatIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .slice(0, 12)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
      return `- ${path}: ${issue.message}`;
    })
    .join('\n');
}
