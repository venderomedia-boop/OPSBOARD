import assert from 'node:assert/strict';
import {
  addFormTypeVersion,
  configureJobCompliance,
  createFormType,
  createJobTemplate,
  ensureFormInstancesForJob,
  getComplianceOverview,
  getFormTypeDetail,
  runComplianceSelfTest,
  saveFormInstance,
} from './compliance-store.mjs';

export function runDynamicFormBuildTest() {
  const engine = runComplianceSelfTest();
  assert.equal(engine.ok, true, `Base compliance self-test failed: ${JSON.stringify(engine.checks)}`);

  const formTypeId = 'ft-build-selftest';
  const templateId = 'jt-build-selftest';

  const version1Schema = {
    sections: [
      {
        id: 'readings',
        label: 'Test Readings',
        kind: 'asset_matrix',
        matrixColumns: ['Flow', 'Return'],
        appliesToAssetTypes: ['tap'],
      },
      {
        id: 'engineer',
        label: 'Engineer',
        kind: 'fields',
        fields: [
          { id: 'initials', label: 'Initials', type: 'text', required: true },
          { id: 'test_date', label: 'Date', type: 'date', required: true },
        ],
      },
    ],
  };

  const created = createFormType({
    id: formTypeId,
    name: 'Build Self-Test Dynamic Form',
    category: 'general',
    assetScope: 'asset',
    appliesToAssetTypes: ['tap'],
    frequency: 'ad_hoc',
    schema: version1Schema,
  });
  assert.equal(created.currentVersion, 1, 'New FormType should start at version 1');

  const version2 = addFormTypeVersion(formTypeId, {
    schema: {
      sections: [
        ...version1Schema.sections,
        { id: 'notes', label: 'Notes', kind: 'text_area' },
      ],
    },
  });
  assert.equal(version2.currentVersion, 2, 'Adding a schema version should increment currentVersion');

  const template = createJobTemplate({
    id: templateId,
    name: 'Build Self-Test Visit',
    category: 'general',
    requiredFormTypeIds: [formTypeId],
  });
  assert.deepEqual(template.requiredFormTypeIds, [formTypeId]);

  configureJobCompliance('job-7', { siteId: 'site-1', jobTemplateId: templateId });
  const expanded = ensureFormInstancesForJob('job-7').filter((instance) => instance.formTypeId === formTypeId);
  assert.equal(expanded.length, 4, 'Three tap assets plus one form-level instance should be created');
  assert.ok(expanded.every((instance) => instance.formTypeVersion === 2), 'All instances must pin to version 2');

  const again = ensureFormInstancesForJob('job-7').filter((instance) => instance.formTypeId === formTypeId);
  assert.equal(again.length, 4, 'Repeated expansion must be idempotent');

  const version3 = addFormTypeVersion(formTypeId, {
    schema: {
      sections: [
        ...version1Schema.sections,
        { id: 'notes', label: 'Notes', kind: 'text_area', defaultText: 'Version 3 notes' },
      ],
    },
  });
  assert.equal(version3.currentVersion, 3);

  const detail = getFormTypeDetail('job-7', formTypeId);
  assert.ok(detail, 'Dynamic form detail must resolve after template expansion');
  assert.equal(detail.formType.currentVersion, 2, 'Existing job must continue rendering its pinned schema version');
  assert.equal(detail.instances.length, 4);

  const assetInstance = detail.instances.find((instance) => instance.assetId && instance.assetId !== '__form_level__');
  assert.ok(assetInstance, 'At least one asset-scoped instance must exist');
  const saved = saveFormInstance(assetInstance.id, {
    answers: { Flow: 44, Return: 35 },
    status: 'completed',
    submittedBy: 'build-selftest',
  });
  assert.equal(saved.status, 'completed');
  assert.equal(saved.answers.Flow, 44);
  assert.ok(saved.submittedAt, 'Completed instance should receive submittedAt');

  const overview = getComplianceOverview();
  const reflected = overview.formInstances.find((instance) => instance.id === assetInstance.id);
  assert.equal(reflected?.status, 'completed', 'Saved engineer answer must be visible in compliance overview');
  assert.equal(reflected?.answers?.Return, 35);

  let invalidRejected = false;
  try {
    createFormType({
      id: 'ft-build-invalid',
      name: 'Invalid Checklist Collision',
      category: 'general',
      assetScope: 'asset',
      appliesToAssetTypes: ['tap'],
      frequency: 'ad_hoc',
      schema: {
        sections: [
          { id: 'check-1', kind: 'asset_checklist', appliesToAssetTypes: ['tap'] },
          { id: 'check-2', kind: 'asset_checklist', appliesToAssetTypes: ['tap'] },
        ],
      },
    });
  } catch (error) {
    invalidRejected = Number(error?.statusCode) === 422;
  }
  assert.equal(invalidRejected, true, 'Renderer-ambiguous dynamic schemas must be rejected');

  return {
    ok: true,
    baseChecks: `${engine.passed}/${engine.total}`,
    createdFormType: formTypeId,
    createdVersions: 3,
    expandedInstances: expanded.length,
    pinnedRendererVersion: detail.formType.currentVersion,
    savedInstance: assetInstance.id,
    overviewReflectsSave: reflected?.status === 'completed',
    invalidSchemaRejected: invalidRejected,
  };
}
