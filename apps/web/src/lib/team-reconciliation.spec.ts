import { parseTeamReconciliationForm } from './team-reconciliation';

const teamId = '8f942adb-4f54-45a3-a6fe-fdf7f7c743e0';
const memberId = '1eaed817-a6b1-4e07-8860-849950efa9dc';

describe('team reconciliation form', () => {
  it('parses a bulk assignment to an existing canonical manager', () => {
    const form = new FormData();
    form.append('teamSeasonId', teamId);
    form.append('teamSeasonId', teamId);
    form.set('target', memberId);

    expect(parseTeamReconciliationForm(form)).toEqual({
      input: {
        target: { kind: 'existing', memberId },
        teamSeasonIds: [teamId],
      },
      success: true,
    });
  });

  it('parses a new canonical manager without accepting surrounding whitespace', () => {
    const form = new FormData();
    form.set('teamSeasonId', teamId);
    form.set('target', 'new');
    form.set('displayName', '  New Manager  ');

    expect(parseTeamReconciliationForm(form)).toEqual({
      input: {
        target: { displayName: 'New Manager', kind: 'new' },
        teamSeasonIds: [teamId],
      },
      success: true,
    });
  });

  it('rejects malformed team identifiers', () => {
    const form = new FormData();
    form.set('teamSeasonId', 'not-a-team');
    form.set('target', memberId);

    expect(parseTeamReconciliationForm(form)).toEqual({
      message: 'The selected team-seasons are invalid.',
      success: false,
    });
  });
});
