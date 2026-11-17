import { runFullBatch } from "lib/job/bench-work"
import { collectPrintedLabels } from "lib/job/label-collection"
import { hasLaserWork, runLaserJob } from "lib/job/laser-steps"
import {
  collectFinishedPlates,
  getFinishedPrinters,
  refillSpacerBasket,
} from "lib/job/printer-steps"
import type { SimContext } from "lib/simulation/sim-context"
import type { SimTask } from "lib/tasks/coroutines"

export type ScenarioId =
  | "run_batch"
  | "refill_spacers"
  | "collect_labels"
  | "engrave_boxes"

/** Run the line from wherever it is now, bench by bench, until the carton ships. */
export function* runBatchScenario(ctx: SimContext): SimTask {
  yield* runFullBatch(ctx)
}

/** Collect every finished printer plate and pour the spacers into the assembly basket. */
export function* refillSpacersScenario(ctx: SimContext): SimTask {
  if (getFinishedPrinters(ctx).length === 0 && !ctx.world.carriedTub) {
    ctx.statusText =
      "No printer has a finished plate yet. Use “3D prints ready” to finish them."
    return
  }
  yield* collectFinishedPlates(ctx)
  yield* refillSpacerBasket(ctx)
}

/** Take the printed label sheets from the label printer to pack-out. */
export function* collectLabelsScenario(ctx: SimContext): SimTask {
  if (ctx.world.labelPrinter.printedSheets.length === 0) {
    ctx.statusText =
      "The label printer hasn't printed any sheets yet. Use “Labels printed” to fill its tray."
    return
  }
  yield* collectPrintedLabels(ctx)
}

/** At the UV laser: unload a finished run, start the next, and take the engraved boxes to pack-out. */
export function* engraveBoxesScenario(ctx: SimContext): SimTask {
  if (!ctx.world.uvLaser) {
    ctx.statusText = "This line has no UV laser"
    return
  }
  if (!hasLaserWork(ctx)) {
    ctx.statusText = ctx.world.uvLaser.isEngraving
      ? "The UV laser is still engraving. Use “Engraving done” to finish it."
      : "Every box is engraved and at pack-out"
    return
  }
  yield* runLaserJob({}, ctx)
}
