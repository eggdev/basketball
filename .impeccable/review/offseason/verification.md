# Offseason workflow verification

- Production Next.js `/team` checked signed out: upcoming-season preparation, owner-access and missing-projection states render.
- Populated screenshots use real application components in an isolated Vite harness with explicitly labeled synthetic data and mocked authentication/actions. They do not verify production database writes.
- Desktop: 1440×1000. Mobile: 390×844. Mobile document width confirmed 390px; captures taken after navigation transition settled.
- Draft stages keep form panels mounted, preserving unsaved inputs between stages. Automated test covers this and preserves selected-plan query context.
- 58 web tests passed, including Finals/opening boundaries, missing calendars, tier thresholds, manual mode, and stale projections.
- Nx build, lint, and typecheck passed.
- Automatic season mode uses reviewed dates in `config/season-experience.json`; it does not poll NBA results. New annual boundaries must be maintained. Browser-local manual override remains available.
- Detector ran once. Existing shell token advisories predate this change; new semantic signal colors are intentional additions requested by the user.

- Independent finish review used a fresh general reviewer with the degraded Impeccable contract because the specialized reviewer role was unavailable. Navigation finding fixed and regression-tested.

- Final reviewer verdict: both material fixes resolved; ship at the scope of those fixes. Authenticated database writes remain unverified.
