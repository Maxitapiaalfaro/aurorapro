/**
 * Sub-Agent Handler Registry
 *
 * Registers all 4 sub-agent tool handlers into the main tool-handlers registry.
 * Each handler uses dynamic import to its implementation file for lazy loading.
 */

import { registerToolHandler } from '../tool-handlers';

export function registerSubAgentHandlers(): void {
  registerToolHandler('explore_patient_context', async (args, ctx) => {
    const { executeExplorePatientContext } = await import('./explore-patient-context');
    return executeExplorePatientContext(args, ctx);
  });

  registerToolHandler('generate_clinical_document', async (args, ctx) => {
    const { executeGenerateClinicalDocument } = await import('./generate-clinical-document');
    return executeGenerateClinicalDocument(args, ctx);
  });

  registerToolHandler('update_clinical_document', async (args, ctx) => {
    const { executeUpdateClinicalDocument } = await import('./update-clinical-document');
    return executeUpdateClinicalDocument(args, ctx);
  });

  registerToolHandler('research_evidence', async (args, ctx) => {
    const { executeResearchEvidence } = await import('./research-evidence');
    return executeResearchEvidence(args, ctx);
  });

  registerToolHandler('analyze_longitudinal_patterns', async (args, ctx) => {
    const { executeAnalyzeLongitudinalPatterns } = await import('./analyze-longitudinal-patterns');
    return executeAnalyzeLongitudinalPatterns(args, ctx);
  });
}
