/** The game situation a preview is drawn in. Ticket 07 adds time left, stacks, target and combat. */
export interface Situation {
  /** Whether the aura's trigger is active (e.g. the buff is present). */
  active: boolean;
}

export const DEFAULT_SITUATION: Situation = { active: true };
