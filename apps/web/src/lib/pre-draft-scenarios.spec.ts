import {
  parsePreDraftScenarioForm,
  parsePreDraftTargetForm,
} from './pre-draft-scenarios';

const planId = '00000000-0000-4000-8000-000000000101';
const playerId = '00000000-0000-4000-8000-000000000201';

const validDetailsForm = (): FormData => {
  const form = new FormData();
  form.set('seasonKey', '2026-27');
  form.set('name', 'Balanced build');
  form.set('strategyAngle', 'Preserve flexibility through the middle game.');
  form.set('primaryGoal', 'make-playoffs');
  form.set('riskTolerance', 'balanced');
  form.set('anchorBudget', '80');
  form.set('coreBudget', '90');
  form.set('endgameBudget', '30');
  form.set('streamingSlots', '1');
  form.set('notes', 'Stay patient.');
  return form;
};

describe('pre-draft scenario forms', () => {
  it('parses complete create and update commands with integer cents', () => {
    expect(parsePreDraftScenarioForm(validDetailsForm(), 'create')).toEqual({
      command: {
        details: {
          anchorBudgetCents: 8_000,
          coreBudgetCents: 9_000,
          endgameBudgetCents: 3_000,
          name: 'Balanced build',
          notes: 'Stay patient.',
          primaryGoal: 'make-playoffs',
          riskTolerance: 'balanced',
          strategyAngle: 'Preserve flexibility through the middle game.',
          streamingSlots: 1,
        },
        intent: 'create',
        seasonKey: '2026-27',
      },
      success: true,
    });

    const update = validDetailsForm();
    update.set('planId', planId);
    expect(parsePreDraftScenarioForm(update, 'update')).toMatchObject({
      command: { intent: 'update', planId },
      success: true,
    });
  });

  it.each([
    ['name', ''],
    ['anchorBudget', '-1'],
    ['coreBudget', '20.999'],
    ['streamingSlots', '4'],
    ['streamingSlots', '1.5'],
  ])('rejects invalid %s without returning a partial command', (field, value) => {
    const form = validDetailsForm();
    form.set(field, value);
    const result = parsePreDraftScenarioForm(form, 'create');

    expect(result.success).toBe(false);
    expect('command' in result).toBe(false);
  });

  it('validates UUIDs and explicit lifecycle intents', () => {
    const duplicate = new FormData();
    duplicate.set('seasonKey', '2026-27');
    duplicate.set('sourcePlanId', planId);
    duplicate.set('name', 'Balanced copy');
    expect(parsePreDraftScenarioForm(duplicate, 'duplicate')).toEqual({
      command: {
        intent: 'duplicate',
        name: 'Balanced copy',
        seasonKey: '2026-27',
        sourcePlanId: planId,
      },
      success: true,
    });

    for (const intent of ['activate', 'archive'] as const) {
      const form = new FormData();
      form.set('seasonKey', '2026-27');
      form.set('planId', planId);
      expect(parsePreDraftScenarioForm(form, intent)).toMatchObject({
        command: { intent, planId },
        success: true,
      });
      form.set('planId', 'not-a-uuid');
      expect(parsePreDraftScenarioForm(form, intent).success).toBe(false);
    }
  });

  it('parses a scoped target without accepting malformed values', () => {
    const form = new FormData();
    form.set('seasonKey', '2026-27');
    form.set('planId', planId);
    form.set('playerId', playerId);
    form.set('stance', 'target');
    form.set('priority', '1');
    form.set('maxBid', '72.50');
    form.set('rationale', 'League discount');

    expect(parsePreDraftTargetForm(form)).toEqual({
      input: {
        maxBidCents: 7_250,
        planId,
        playerId,
        priority: 1,
        rationale: 'League discount',
        seasonKey: '2026-27',
        stance: 'target',
      },
      success: true,
    });
    form.set('playerId', 'foreign');
    expect(parsePreDraftTargetForm(form).success).toBe(false);
  });
});
