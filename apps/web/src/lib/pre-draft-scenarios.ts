import type {
  PreDraftScenarioDetailsInput,
  PreDraftTargetStance,
} from '@fantasy-basketball/database/runtime';

export interface PreDraftScenarioActionState {
  readonly message: string | null;
  readonly status: 'error' | 'idle' | 'success';
}

export type ParsedPreDraftScenarioCommand =
  | {
      readonly details: PreDraftScenarioDetailsInput;
      readonly intent: 'create';
      readonly seasonKey: string;
    }
  | {
      readonly details: PreDraftScenarioDetailsInput;
      readonly intent: 'update';
      readonly planId: string;
      readonly seasonKey: string;
    }
  | {
      readonly intent: 'duplicate';
      readonly name: string;
      readonly seasonKey: string;
      readonly sourcePlanId: string;
    }
  | {
      readonly intent: 'activate';
      readonly planId: string;
      readonly seasonKey: string;
    }
  | {
      readonly intent: 'archive';
      readonly planId: string;
      readonly replacementPlanId?: string;
      readonly seasonKey: string;
    };

export type PreDraftScenarioFormResult =
  | { readonly command: ParsedPreDraftScenarioCommand; readonly success: true }
  | { readonly message: string; readonly success: false };

export type PreDraftTargetFormResult =
  | {
      readonly input: {
        readonly maxBidCents: number | null;
        readonly planId: string;
        readonly playerId: string;
        readonly priority: number;
        readonly rationale: string;
        readonly seasonKey: string;
        readonly stance: PreDraftTargetStance;
      };
      readonly success: true;
    }
  | { readonly message: string; readonly success: false };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const seasonPattern = /^\d{4}-\d{2}$/;

const formText = (formData: FormData, key: string): string => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

const parseDollars = (formData: FormData, key: string): number | null => {
  const text = formText(formData, key);
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  return Math.round(value * 100);
};

const parseSeason = (formData: FormData): string | null => {
  const seasonKey = formText(formData, 'seasonKey');
  return seasonPattern.test(seasonKey) ? seasonKey : null;
};

const parsePlanId = (formData: FormData, key = 'planId'): string | null => {
  const planId = formText(formData, key);
  return uuidPattern.test(planId) ? planId : null;
};

const parseDetails = (formData: FormData): PreDraftScenarioDetailsInput | null => {
  const name = formText(formData, 'name');
  const strategyAngle = formText(formData, 'strategyAngle');
  const notes = formText(formData, 'notes');
  const primaryGoal = formText(formData, 'primaryGoal');
  const riskTolerance = formText(formData, 'riskTolerance');
  const streamingSlots = Number(formText(formData, 'streamingSlots'));
  const anchorBudgetCents = parseDollars(formData, 'anchorBudget');
  const coreBudgetCents = parseDollars(formData, 'coreBudget');
  const endgameBudgetCents = parseDollars(formData, 'endgameBudget');
  if (
    name.length < 2 ||
    name.length > 80 ||
    strategyAngle.length < 2 ||
    strategyAngle.length > 240 ||
    notes.length > 1_500 ||
    !['make-playoffs', 'win-championship'].includes(primaryGoal) ||
    !['conservative', 'balanced', 'aggressive'].includes(riskTolerance) ||
    !Number.isInteger(streamingSlots) ||
    streamingSlots < 0 ||
    streamingSlots > 3 ||
    anchorBudgetCents === null ||
    coreBudgetCents === null ||
    endgameBudgetCents === null
  ) {
    return null;
  }
  return {
    anchorBudgetCents,
    coreBudgetCents,
    endgameBudgetCents,
    name,
    notes,
    primaryGoal: primaryGoal as PreDraftScenarioDetailsInput['primaryGoal'],
    riskTolerance: riskTolerance as PreDraftScenarioDetailsInput['riskTolerance'],
    strategyAngle,
    streamingSlots,
  };
};

export const parsePreDraftScenarioForm = (
  formData: FormData,
  intent: ParsedPreDraftScenarioCommand['intent'],
): PreDraftScenarioFormResult => {
  const seasonKey = parseSeason(formData);
  if (seasonKey === null) return { message: 'Choose a valid league season.', success: false };

  if (intent === 'create' || intent === 'update') {
    const details = parseDetails(formData);
    if (details === null) {
      return {
        message: 'Complete the scenario name, strategy, budgets, risk, and streaming fields.',
        success: false,
      };
    }
    if (intent === 'create') {
      return { command: { details, intent, seasonKey }, success: true };
    }
    const planId = parsePlanId(formData);
    return planId === null
      ? { message: 'The selected scenario is invalid.', success: false }
      : { command: { details, intent, planId, seasonKey }, success: true };
  }

  if (intent === 'duplicate') {
    const sourcePlanId = parsePlanId(formData, 'sourcePlanId');
    const name = formText(formData, 'name');
    if (sourcePlanId === null) {
      return { message: 'The source scenario is invalid.', success: false };
    }
    if (name.length < 2 || name.length > 80) {
      return { message: 'Enter a copy name between 2 and 80 characters.', success: false };
    }
    return { command: { intent, name, seasonKey, sourcePlanId }, success: true };
  }

  const planId = parsePlanId(formData);
  if (planId === null) return { message: 'The selected scenario is invalid.', success: false };
  if (intent === 'activate') {
    return { command: { intent, planId, seasonKey }, success: true };
  }
  const replacementPlanIdText = formText(formData, 'replacementPlanId');
  const replacementPlanId =
    replacementPlanIdText === '' ? undefined : parsePlanId(formData, 'replacementPlanId');
  if (replacementPlanId === null) {
    return { message: 'The replacement scenario is invalid.', success: false };
  }
  return {
    command: {
      intent,
      planId,
      ...(replacementPlanId === undefined ? {} : { replacementPlanId }),
      seasonKey,
    },
    success: true,
  };
};

export const parsePreDraftTargetForm = (formData: FormData): PreDraftTargetFormResult => {
  const planId = parsePlanId(formData);
  const playerId = parsePlanId(formData, 'playerId');
  const seasonKey = parseSeason(formData);
  const stance = formText(formData, 'stance');
  const priority = Number(formText(formData, 'priority'));
  const maxBidText = formText(formData, 'maxBid');
  const maxBidCents = maxBidText === '' ? null : parseDollars(formData, 'maxBid');
  const rationale = formText(formData, 'rationale');
  if (
    planId === null ||
    playerId === null ||
    seasonKey === null ||
    !['avoid', 'target', 'watch'].includes(stance) ||
    !Number.isInteger(priority) ||
    priority < 1 ||
    priority > 5 ||
    (maxBidText !== '' && maxBidCents === null) ||
    rationale.length > 240
  ) {
    return { message: 'Choose a valid player, stance, priority, and maximum bid.', success: false };
  }
  return {
    input: {
      maxBidCents,
      planId,
      playerId,
      priority,
      rationale,
      seasonKey,
      stance: stance as PreDraftTargetStance,
    },
    success: true,
  };
};
