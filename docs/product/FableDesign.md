
What this does not close

Say these in the report as limits, per both documents' honesty discipline: patch quality is model-limited — validation with small k passes noise; failure-class keying is coarse, so over-narrow refinements accumulate and need a cap/GC before the harness overview bloats; cross-model transfer (t8max policy → 3.7-plus) is an empirical question §7.2 tests, not a design property; and the dispatcher cannot see silent degradation — a refinement that worsens behavior without re-triggering its own failure class is caught only by the eval ladder, never by the loop itself.

Sequencing to 09-05

§7.2's E-refine experiment as written is the manual execution of this loop — human extracts from the t8max session, writes global, reruns plus against MSE 9.585. Run it first, unchanged: it answers "does harness-layer transfer help at all" before you spend anything on automation, and if the answer is no, the dispatcher isn't worth building before the deadline. The dispatcher (small: an event consumer + failure-class keys + a validation counter over existing Prime machinery) is what makes §7.2 repeatable, and the minimal comparison stays exactly Approach 1's design — fixed pipeline ± failure-triggered refinement, measuring repeated-error rate per failure class, recovery speed, rollback rate, cost, and gate integrity + unsupported claims, which must come out unchanged: that invariance is the empirical proof the two loops are actually separate.

gates), and nobody calls those a controller. They are authorities. The checkpoint predicate is simply the π-side authority, and it is smaller than any gate you already run.

Everything else — noticing (counters), deciding to act (dispatch), understanding the failure (episode), authoring the fix (patch content) — stays with skills and the model, because on the π side those are all proposal, and proposal is free in both loops.

6. Ceilings, stated plainly

The ⚠ path shares the anchor's known dependency (a session that never anchors never dispatches — backstopped by the checkpoint path and the liveness fixture). Failure-class keying is coarse; small k passes noise — accepted, because promotion is reversible by construction. A patch that degrades behavior without re-triggering its own failure class is invisible to the loop and caught only by the eval ladder. And one Goodhart guard worth writing into the card: refinement count is a residual statistic, never a target — the ideal session produces zero refinements because it produced zero repeated residuals. Do not let any report celebrate "N lessons learned."

7. Sequence

Unchanged from before, now with the destination explicit: run §7.2's manual E-refine first (it tests whether the payload — harness-layer transfer — is worth anything, before any wiring). If it shows signal, the build order is the five nodes in the order listed — residual stream + counter first, because every other node consumes it.

4. Promotion checkpoint + harness_state archive entry in the campaign lifecycle (before disposeAndArchiveResearchSession).
5. Rewire resolvePiAutoRefineOverride to install reviewer + serializedRefine (and update its test, whose description already names this intent).

One honest ceiling to carry into the eval: the reviewer can only trigger on residuals the stream captures — a policy that degrades quietly without tripping any guard, gate, or rejection is invisible to this loop and remains the eval ladder's job (E-refine §7.2 comparison, arms with harness_state pinned).

Next action: run §7.2's manual E-refine first, unchanged — it tests whether promoted harness lessons transfer at all before any of the five pieces are worth building.